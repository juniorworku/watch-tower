import hashlib
import hmac
import json
import time
from concurrent.futures import ThreadPoolExecutor
import httpx
import pytest
from backend.app import channels
from backend.app.domain import now_iso


@pytest.fixture(autouse=True)
def no_live_provider_requests(monkeypatch):
    monkeypatch.setattr(channels, 'deliver_after_write', lambda *_: None)


def connect(client, app, provider='telegram'):
    env = app.state.settings.integration_env
    env.update(BOT_TOKEN='fake-token', BOT_SECRET='fake-secret', BOT_VERIFY='fake-verify')
    agent = client.post('/api/registry', json={'name': f'{provider} worker', 'platform': provider}).json()['agent']
    body = {'provider': provider, 'destination': '-1001' if provider == 'telegram' else 'C111' if provider == 'slack' else '15551234567',
            'allowedSenders': ['42'] if provider == 'telegram' else ['U42'] if provider == 'slack' else ['15551234567'],
            'tokenEnv': 'BOT_TOKEN', 'secretEnv': 'BOT_SECRET', 'enabled': True,
            'workspaceId': 'T111', 'accountId': '123', 'apiVersion': 'v23.0', 'verifyTokenEnv': 'BOT_VERIFY'}
    response = client.put(f"/api/registry/{agent['id']}/channel", json=body)
    assert response.status_code == 200, response.text
    return agent['id'], response.json()['connection'], body


def incoming(client, agent_id, connection, text, event_id='1', sender=None):
    provider = connection['provider']
    sender = sender or connection['allowedSenders'][0]
    if provider == 'telegram':
        payload = {'update_id': event_id, 'message': {'chat': {'id': connection['destination']}, 'from': {'id': sender}, 'text': text}}
    elif provider == 'slack':
        payload = {'team_id': 'T111', 'event_id': event_id, 'event': {'type': 'message', 'channel': 'C111', 'user': sender, 'text': text}}
    else:
        payload = {'entry': [{'changes': [{'value': {'metadata': {'phone_number_id': '123'}, 'messages': [{'id': event_id, 'from': sender, 'type': 'text', 'text': {'body': text}}]}}]}]}
    return post_signed(client, agent_id, provider, payload)


def post_signed(client, agent_id, provider, payload, stale=False):
    raw = json.dumps(payload).encode()
    if provider == 'telegram':
        headers = {'X-Telegram-Bot-Api-Secret-Token': 'fake-secret'}
    elif provider == 'slack':
        stamp = str(int(time.time()) - (600 if stale else 0))
        signature = hmac.new(b'fake-secret', b'v0:' + stamp.encode() + b':' + raw, hashlib.sha256).hexdigest()
        headers = {'X-Slack-Request-Timestamp': stamp, 'X-Slack-Signature': 'v0=' + signature}
    else:
        headers = {'X-Hub-Signature-256': 'sha256=' + hmac.new(b'fake-secret', raw, hashlib.sha256).hexdigest()}
    return client.post(f'/api/channels/{agent_id}/webhook', content=raw, headers=headers)


@pytest.mark.parametrize('provider', ['telegram', 'slack', 'whatsapp'])
def test_verified_task_lifecycle_review_deduplication_and_conversation(logged_in, app, provider):
    client = logged_in
    agent_id, connection, _ = connect(client, app, provider)
    task = client.post('/api/tasks', json={'title': 'Research', 'assigneeId': agent_id}).json()['task']
    path = f'/api/channels/{agent_id}/webhook'
    assert client.post(path, json={}).status_code == 401
    assert incoming(client, agent_id, connection, '/heartbeat', 'unknown', sender='999').json()['received'] == 0
    for i, command in enumerate([f"/accept {task['id']}", f"/start {task['id']}", f"/progress {task['id']} Working", f"/submit {task['id']} Findings | The completed research"]):
        response = incoming(client, agent_id, connection, command, str(i))
        assert response.status_code == 200, response.text
        assert response.json()['received'] == 1
        assert incoming(client, agent_id, connection, command, str(i)).json()['received'] == 0
    state = app.state.repository.read()
    assert state['tasks'][0]['status'] == 'review'
    assert len(state['tasks'][0]['deliverables']) == 1
    assert client.patch('/api/tasks', json={'id': task['id'], 'action': 'request_changes', 'message': 'Add sources'}).status_code == 200
    assert any('Add sources' in r['text'] for r in app.state.repository.read()['outbox'])
    assert incoming(client, agent_id, connection, f"/submit {task['id']} Revised | Sources added", 'revised').status_code == 200
    assert client.patch('/api/tasks', json={'id': task['id'], 'action': 'approve'}).status_code == 200
    assert app.state.repository.read()['tasks'][0]['status'] == 'done'
    message = client.post('/api/messages', json={'agentId': agent_id, 'text': 'Explain the result'}).json()['message']
    assert message['deliveryStatus'] == 'queued'
    assert incoming(client, agent_id, connection, f"/reply {message['id']} Here is the summary", 'reply').status_code == 200
    assert app.state.repository.read()['messages'][0]['reply'] == 'Here is the summary'
    assert incoming(client, agent_id, connection, 'Additional context', 'free').status_code == 200
    assert app.state.repository.read()['messages'][-1]['direction'] == 'inbound'
    assert 'outbox' not in client.get('/api/state').json()
    assert 'channelReceipts' not in client.get('/api/state').json()
    assert 'fake-token' not in client.get(f'/api/registry/{agent_id}/channel').text


def test_wrong_agent_commands_rejected_and_no_self_approval(logged_in, app):
    agent_id, config, _ = connect(logged_in, app)
    other = logged_in.post('/api/registry', json={'name': 'Other'}).json()['agent']
    task = logged_in.post('/api/tasks', json={'title': 'Private work', 'assigneeId': other['id']}).json()['task']
    assert incoming(logged_in, agent_id, config, f"/start {task['id']}").json()['received'] == 1
    state = app.state.repository.read()
    assert state['tasks'][0]['status'] == 'assigned'
    assert state['channelReceipts'][-1]['outcome'] == 'rejected'
    assert incoming(logged_in, agent_id, config, f"/approve {task['id']}", 'approve').status_code == 200
    assert app.state.repository.read()['tasks'][0]['status'] == 'assigned'


def test_slack_challenge_expiry_and_workspace_routing(logged_in, app):
    agent_id, config, _ = connect(logged_in, app, 'slack')
    challenge = {'type': 'url_verification', 'challenge': 'challenge'}
    assert post_signed(logged_in, agent_id, 'slack', challenge).json() == {'challenge': 'challenge'}
    assert post_signed(logged_in, agent_id, 'slack', challenge, stale=True).status_code == 401
    assert post_signed(logged_in, agent_id, 'slack', {'team_id': 'TOTHER', 'event_id': 'x', 'event': {'type': 'message', 'channel': 'C111', 'user': 'U42', 'text': '/heartbeat'}}).json()['received'] == 0


def test_whatsapp_subscription_verification_and_receipts(logged_in, app):
    agent_id, config, _ = connect(logged_in, app, 'whatsapp')
    url = f'/api/channels/{agent_id}/webhook'
    assert logged_in.get(url, params={'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '123'}).status_code == 401
    assert logged_in.get(url, params={'hub.mode': 'subscribe', 'hub.verify_token': 'fake-verify', 'hub.challenge': '123'}).text == '123'
    logged_in.post('/api/messages', json={'agentId': agent_id, 'text': 'Hello'})
    def sent(s):
        s['outbox'][0].update(status='sent', providerMessageId='wamid.1')
    app.state.repository.mutate(sent)
    payload = {'entry': [{'changes': [{'value': {'metadata': {'phone_number_id': '123'}, 'statuses': [{'id': 'wamid.1', 'recipient_id': '15551234567', 'status': 'read'}]}}]}]}
    assert post_signed(logged_in, agent_id, 'whatsapp', payload).status_code == 200
    assert app.state.repository.read()['messages'][0]['deliveryStatus'] == 'read'
    payload['entry'][0]['changes'][0]['value']['statuses'][0]['status'] = 'sent'
    post_signed(logged_in, agent_id, 'whatsapp', payload)
    assert app.state.repository.read()['messages'][0]['deliveryStatus'] == 'read'


@pytest.mark.parametrize('provider', ['telegram', 'slack', 'whatsapp'])
def test_provider_delivery_protocol_and_status(logged_in, app, provider):
    agent_id, connection, _ = connect(logged_in, app, provider)
    if provider == 'whatsapp':
        incoming(logged_in, agent_id, connection, 'Hello')
    logged_in.post('/api/messages', json={'agentId': agent_id, 'text': 'Hello from dashboard'})
    def handler(request):
        data = json.loads(request.content)
        assert 'Hello from dashboard' in (data.get('text', {}).get('body', '') if provider == 'whatsapp' else data['text'])
        if provider == 'telegram':
            assert data['chat_id'] == '-1001'
            return httpx.Response(200, json={'ok': True, 'result': {'message_id': 123}})
        assert request.headers['authorization'] == 'Bearer fake-token'
        return httpx.Response(200, json={'ok': True, 'ts': '123.456'}) if provider == 'slack' else httpx.Response(200, json={'messages': [{'id': 'wamid.123'}]})
    with httpx.Client(transport=httpx.MockTransport(handler)) as transport:
        assert channels.dispatch(app.state.repository, app.state.settings, agent_id, client=transport)['processed'] == 1
    assert app.state.repository.read()['outbox'][0]['status'] == 'sent'
    outgoing = next(m for m in app.state.repository.read()['messages'] if m.get('direction') == 'outbound')
    assert outgoing['deliveryStatus'] == 'sent'
    assert not outgoing.get('deliveredAt')


def test_whatsapp_window_template_and_missing_configuration(logged_in, app):
    agent_id, config, _ = connect(logged_in, app, 'whatsapp')
    row = {'text': 'Task', 'attempts': 1}
    with httpx.Client(transport=httpx.MockTransport(lambda _: pytest.fail('Must not send outside window without template'))) as transport:
        result = channels.send_provider(config, row, app.state.settings, transport)
    assert result['status'] == 'failed' and 'template' in result['lastError']
    config.update(templateName='task_update', templateLanguage='en_US')
    def handler(request):
        assert json.loads(request.content)['template']['components'][0]['parameters'][0]['text'] == 'Task'
        return httpx.Response(200, json={'messages': [{'id': 'wamid.template'}]})
    with httpx.Client(transport=httpx.MockTransport(handler)) as transport:
        assert channels.send_provider(config, row, app.state.settings, transport)['status'] == 'sent'


def test_rate_limits_unknown_outcomes_and_safe_error_redaction(logged_in, app):
    agent_id, config, _ = connect(logged_in, app)
    logged_in.post('/api/messages', json={'agentId': agent_id, 'text': 'One'})
    def limited(_):
        return httpx.Response(429, json={}, headers={'Retry-After': '120'})
    with httpx.Client(transport=httpx.MockTransport(limited)) as transport:
        channels.dispatch(app.state.repository, app.state.settings, agent_id, client=transport)
    row = app.state.repository.read()['outbox'][0]
    assert row['status'] == 'queued' and row.get('nextAttemptAt')
    def due(s):
        s['outbox'][0]['nextAttemptAt'] = now_iso()
    app.state.repository.mutate(due)
    def timeout(request):
        raise httpx.ReadTimeout('fake-token in URL', request=request)
    with httpx.Client(transport=httpx.MockTransport(timeout)) as transport:
        channels.dispatch(app.state.repository, app.state.settings, agent_id, client=transport)
    row = app.state.repository.read()['outbox'][0]
    assert row['status'] == 'unknown' and 'fake-token' not in row['lastError']
    path = f'/api/registry/{agent_id}/deliveries'
    assert logged_in.post(path, json={'action': 'retry', 'id': row['id']}).status_code == 409
    assert logged_in.post(path, json={'action': 'retry', 'id': row['id'], 'confirmDuplicateRisk': True}).status_code == 200


def test_concurrent_claims_and_connection_changes(logged_in, app):
    agent_id, config, body = connect(logged_in, app)
    logged_in.post('/api/messages', json={'agentId': agent_id, 'text': 'Once'})
    with ThreadPoolExecutor(max_workers=2) as pool:
        claims = list(pool.map(lambda _: app.state.repository.mutate(channels.claim_delivery), range(2)))
    assert sum(v is not None for v in claims) == 1
    def expire(s):
        s['outbox'][0]['leaseUntil'] = '2000-01-01T00:00:00.000Z'
    app.state.repository.mutate(expire)
    app.state.repository.mutate(channels.claim_delivery)
    assert app.state.repository.read()['outbox'][0]['status'] == 'unknown'
    logged_in.post('/api/messages', json={'agentId': agent_id, 'text': 'Unsent'})
    assert logged_in.put(f'/api/registry/{agent_id}/channel', json={**body, 'destination': '-1002'}).status_code == 200
    rows = app.state.repository.read()['outbox']
    assert rows[-1]['status'] == 'cancelled'
    assert logged_in.post(f'/api/registry/{agent_id}/deliveries', json={'action': 'retry', 'id': rows[0]['id'], 'confirmDuplicateRisk': True}).status_code == 409


def test_channel_admin_requires_auth_and_secret_references(logged_in, app):
    agent_id, _, body = connect(logged_in, app)
    assert logged_in.put(f'/api/registry/{agent_id}/channel', json={**body, 'tokenEnv': 'literal-secret'}).status_code == 400
    logged_in.cookies.clear()
    assert logged_in.get(f'/api/registry/{agent_id}/channel').status_code == 401
    assert logged_in.post(f'/api/registry/{agent_id}/deliveries', json={'action': 'dispatch'}).status_code == 401


def test_slack_message_and_mention_duplicate_and_own_echo(logged_in, app):
    agent_id, _, _ = connect(logged_in, app, 'slack')
    payload = {'team_id': 'T111', 'event_id': 'a', 'event': {'type': 'message', 'channel': 'C111', 'user': 'U42', 'text': '/heartbeat', 'ts': '123.1'}}
    assert post_signed(logged_in, agent_id, 'slack', payload).json()['received'] == 1
    payload.update(event_id='b');payload['event']['type'] = 'app_mention'
    assert post_signed(logged_in, agent_id, 'slack', payload).json()['received'] == 0
    payload['event']['ts'] = '123.2';payload['authorizations'] = [{'is_bot': True, 'user_id': 'U42'}]
    assert post_signed(logged_in, agent_id, 'slack', payload).json()['received'] == 0


def test_legacy_empty_state_import_after_new_collections(app):
    from backend.app.seed import empty_state
    legacy = empty_state();legacy.pop('outbox');legacy.pop('channelReceipts')
    def replace(s):
        s.clear();s.update(legacy)
    app.state.repository.initialize()
    app.state.repository.mutate(replace)
    assert app.state.repository.import_state(empty_state())['outbox'] == 0


def test_long_messages_preserve_chunk_order_and_unclear_acceptance(logged_in, app):
    agent_id, config, _ = connect(logged_in, app)
    logged_in.post('/api/messages', json={'agentId': agent_id, 'text': 'x' * 8000})
    first = app.state.repository.mutate(channels.claim_delivery)
    assert first is not None
    assert app.state.repository.mutate(channels.claim_delivery) is None
    def complete_first(s):
        s['outbox'][0]['status'] = 'sent'
    app.state.repository.mutate(complete_first)
    second = app.state.repository.mutate(channels.claim_delivery)
    assert second is not None and second['row']['id'] != first['row']['id']
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={'ok': True}))) as transport:
        assert channels.send_provider(config, first['row'], app.state.settings, transport)['status'] == 'unknown'
