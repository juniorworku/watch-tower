import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from tools import deploy_vercel as deploy


class DeploymentTests(unittest.TestCase):
    def valid(self):
        return {'DATABASE_URL': 'postgresql://user:fake@example.com/app', 'DASHBOARD_PASSWORD_HASH': '[SENSITIVE]', 'PUBLIC_APP_URL': 'https://app.example.com'}

    def test_configuration_and_preserved_secrets(self):
        self.assertEqual(deploy.missing_production({}), ['DATABASE_URL', 'DASHBOARD_PASSWORD', 'PUBLIC_APP_URL'])
        deploy.validate_production(self.valid())
        deploy.validate_production({**self.valid(), 'DATABASE_URL': '[SENSITIVE]'})
        for update in [{'DATABASE_URL': ''}, {'DATABASE_URL': 'postgresql://db/app'}, {'DATABASE_URL': 'postgresql://localhost/app'}, {'DASHBOARD_PASSWORD_HASH': 'bad'}, {'PUBLIC_APP_URL': 'http://localhost'}, {'COOKIE_SECURE': '0'}, {'WATCHTOWER_ENV_FILES': '1'}, {'WATCHTOWER_SEED_FROM_SNAPSHOT': '1'}, {'BACKEND_URL': 'http://backend:8000'}]:
            with self.subTest(update=update), self.assertRaises(ValueError):
                deploy.validate_production({**self.valid(), **update})

    def test_upload_keeps_source_and_excludes_credentials(self):
        for name in ['.env', 'backend/.env.docker', 'data', 'backend/data', 'node_modules', 'state.sqlite3-wal']:
            self.assertFalse(deploy.include_source(name), name)
        self.assertTrue(deploy.include_source('frontend/lib/data'))
        with TemporaryDirectory() as directory:
            target = Path(directory)
            deploy.stage_source(target)
            self.assertFalse((target / 'backend/.env.docker').exists())
            for name in ['types', 'store', 'lifecycle', 'monitoring', 'workflows']:
                self.assertTrue((target / f'frontend/lib/data/{name}.ts').is_file())
            config = json.loads((target / 'vercel.json').read_text())
            for service in config['services'].values():
                context = target / service['root']
                for line in (context / service['entrypoint']).read_text().splitlines():
                    if line.startswith('COPY ') and '--from=' not in line:
                        for source in line.split()[1:-1]:
                            self.assertTrue((context / source).exists(), source)
            subprocess.run(['git', 'init', '--quiet'], cwd=target, check=True)
            (target / '.gitignore').write_text((target / '.vercelignore').read_text())
            self.assertEqual(subprocess.run(['git', 'check-ignore', '--no-index', '-q', 'frontend/lib/data/store.ts'], cwd=target).returncode, 1)
            self.assertEqual(subprocess.run(['git', 'check-ignore', '--no-index', '-q', 'backend/data/state.sqlite3'], cwd=target).returncode, 0)

    def test_runtime_validation_and_retry(self):
        def healthy(url):
            return 200, json.dumps({'status': 'ok', 'configured': True}).encode()
        deploy.verify_deployment('https://app.example.com', request_fn=healthy)
        for status in [500, 302]:
            with self.assertRaisesRegex(RuntimeError, 'runtime verification failed'):
                deploy.verify_deployment('https://app.example.com', request_fn=lambda _: (status, b''), attempts=1)
        calls = []
        def recovering(url):
            calls.append(url)
            return (503, b'') if len(calls) == 1 else healthy(url)
        deploy.verify_deployment('https://app.example.com', request_fn=recovering, pause=lambda: None)
        self.assertEqual(len(calls), 4)

    def test_pipeline_removes_secrets_before_deploy_and_cleans_staging(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            staging_seen = []
            def fake_stage(staging):
                staging.mkdir(parents=True)
            def fake_cli(args, cwd, interactive=False):
                staging_seen.append(cwd)
                if args[0] == 'link':
                    (cwd / '.vercel/project.json').write_text('{}')
                elif args[:2] == ['env', 'pull']:
                    Path(args[2]).write_text('\n'.join(f"{k}='{v}'" for k, v in self.valid().items()))
                elif args[0] == 'deploy':
                    self.assertFalse((cwd / '.vercel/production.env').exists())
            with patch.object(deploy, 'ROOT', root), patch.object(deploy, 'stage_source', fake_stage), patch.object(deploy, 'cli', fake_cli), patch.object(deploy, 'verify_deployment') as verify:
                deploy.main([])
                verify.assert_called_once_with('https://app.example.com')
            self.assertTrue(staging_seen)
            self.assertFalse(staging_seen[0].exists())


if __name__ == '__main__':
    unittest.main()
