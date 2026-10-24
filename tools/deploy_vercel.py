#!/usr/bin/env python3
"""Deploy Watch Tower's HTTP containers to Vercel; keep PostgreSQL managed externally."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, build_opener

try:
    from dotenv import dotenv_values
except ImportError:
    raise SystemExit('Install backend dependencies first: .venv/bin/pip install -r backend/requirements.lock')

ROOT = Path(__file__).resolve().parents[1]
IGNORED = {'.git', '.vercel', '.next', '.venv', 'node_modules', '__pycache__', '.pytest_cache', 'exports', '.secrets'}
STORAGE = {ROOT / 'data', ROOT / 'backend/data'}


def include_source(path):
    path = Path(path)
    absolute = path if path.is_absolute() else ROOT / path
    return (absolute not in STORAGE and path.name not in IGNORED
            and not path.name.startswith('.env')
            and not re.search(r'\.(sqlite3(?:-.*)?|tsbuildinfo|pyc)$', path.name))


def missing_production(values):
    missing = []
    if not values.get('DATABASE_URL', '').strip():
        missing.append('DATABASE_URL')
    if not (values.get('DASHBOARD_PASSWORD_HASH', '').strip() or values.get('DASHBOARD_PASSWORD', '').strip()):
        missing.append('DASHBOARD_PASSWORD')
    if not values.get('PUBLIC_APP_URL', '').strip():
        missing.append('PUBLIC_APP_URL')
    return missing


def validate_production(values):
    missing = ['DASHBOARD_PASSWORD_HASH (or DASHBOARD_PASSWORD)' if key == 'DASHBOARD_PASSWORD' else key
               for key in missing_production(values)]
    if missing:
        raise ValueError('Nothing uploaded: configure these Production variables in the linked Vercel project: '
                         + ', '.join(missing) + '. Run npm run deploy:vercel -- --setup for guided setup. Local dotenv files are not uploaded.')
    if values['DATABASE_URL'] != '[SENSITIVE]':
        try:
            database = urlsplit(values['DATABASE_URL'])
            valid = (database.scheme in {'postgres', 'postgresql'} and database.hostname
                     and database.hostname not in {'db', 'localhost', '127.0.0.1', '0.0.0.0', '::1'})
        except ValueError:
            valid = False
        if not valid:
            raise ValueError('DATABASE_URL must point to hosted PostgreSQL, not your local Docker database.')
    hashed = values.get('DASHBOARD_PASSWORD_HASH', '').strip()
    if hashed and hashed != '[SENSITIVE]' and not re.fullmatch(r'scrypt\$[a-fA-F0-9]{32}\$[a-fA-F0-9]{128}', hashed):
        raise ValueError("DASHBOARD_PASSWORD_HASH must use the app's scrypt format; generate it with the backend hash-password command.")
    try:
        public = urlsplit(values['PUBLIC_APP_URL'])
        valid = public.scheme == 'https' and public.hostname and public.hostname not in {'localhost', '127.0.0.1', '::1'}
    except ValueError:
        valid = False
    if not valid:
        raise ValueError('PUBLIC_APP_URL must be your production HTTPS domain.')
    for key, expected in [('COOKIE_SECURE', '1'), ('WATCHTOWER_ENV_FILES', '0'), ('WATCHTOWER_SEED_FROM_SNAPSHOT', '0')]:
        if key in values and values[key] != expected:
            raise ValueError(f'Set {key}={expected} in Vercel or remove it to use the container default.')
    if values.get('BACKEND_URL'):
        raise ValueError('Remove BACKEND_URL from Vercel project variables; Vercel API calls use PUBLIC_APP_URL.')


def stage_source(destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)

    def copy(source, target):
        if not include_source(source) or source.is_symlink():
            return
        if source.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            for child in source.iterdir():
                copy(child, target / child.name)
        else:
            shutil.copy2(source, target)

    for name in ['package.json', 'package-lock.json', 'vercel.json', '.dockerignore', '.vercelignore', 'frontend', 'backend']:
        copy(ROOT / name, destination / name)
    (destination / 'tools').mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'tools/package.json', destination / 'tools/package.json')


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(url):
    try:
        with build_opener(NoRedirect).open(url, timeout=20) as response:
            return response.status, response.read()
    except HTTPError as error:
        error.close()
        return error.code, b''


def verify_deployment(public_url, request_fn=request, attempts=3, pause=lambda: time.sleep(2)):
    failure = None
    for attempt in range(attempts):
        try:
            for path in ['/health', '/api/session', '/login']:
                status, body = request_fn(urljoin(public_url, path))
                if status != 200:
                    raise ValueError(f'{path} returned HTTP {status}')
                if path == '/health' and json.loads(body).get('status') != 'ok':
                    raise ValueError('Backend health check did not report ok')
                if path == '/api/session' and not json.loads(body).get('configured'):
                    raise ValueError('Backend sign-in password is not configured')
            return
        except (OSError, ValueError) as error:
            failure = error
            if attempt + 1 < attempts:
                pause()
    raise RuntimeError(f'Deployment was created, but runtime verification failed: {failure}. Check Vercel runtime logs and Deployment Protection before using the app.')


def cli(args, cwd, interactive=False):
    env = dict(os.environ)
    if interactive:
        env.pop('CI', None)
    else:
        env['CI'] = '1'
    try:
        result = subprocess.run([os.environ.get('WATCHTOWER_VERCEL_BIN', 'vercel'), *map(str, args)], cwd=cwd, env=env)
    except FileNotFoundError:
        raise RuntimeError('Install the current Vercel CLI (npm install -g vercel), then run vercel login.') from None
    if result.returncode:
        raise RuntimeError('Vercel command failed. Check the CLI output above; no local database was changed.')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check upload locally without contacting Vercel')
    parser.add_argument('--preflight', action='store_true', help='Check cloud settings without deploying')
    parser.add_argument('--setup', action='store_true', help='Prompt for missing Production settings before deploying')
    args = parser.parse_args(argv)
    if args.setup and not sys.stdin.isatty():
        raise ValueError('Run --setup in your terminal so Vercel can prompt for Production settings.')
    with TemporaryDirectory(prefix='watchtower-vercel-') as temporary:
        staging = Path(temporary) / 'watchtower'
        stage_source(staging)
        if args.check:
            print('Upload prepared: both Docker services, same-origin API routing, no dotenv files, local databases, or exports. No deployment made.')
            return
        link_file = ROOT / '.vercel/watchtower/project.json'
        staged_link = staging / '.vercel/project.json'
        staged_link.parent.mkdir(parents=True, exist_ok=True)
        if link_file.exists():
            shutil.copy2(link_file, staged_link)
        else:
            command = ['link', '--yes', '--project', os.environ.get('WATCHTOWER_VERCEL_PROJECT', 'watchtower')]
            if os.environ.get('WATCHTOWER_VERCEL_SCOPE'):
                command += ['--scope', os.environ['WATCHTOWER_VERCEL_SCOPE']]
            cli(command, staging)
            link_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(staged_link, link_file)
        env_path = staging / '.vercel/production.env'

        def pull_production():
            try:
                cli(['env', 'pull', env_path, '--environment=production', '--yes'], staging)
                # Preserve dollar signs and secret placeholders without local interpolation.
                return {key: value for key, value in dotenv_values(env_path, interpolate=False).items() if value is not None}
            finally:
                env_path.unlink(missing_ok=True)

        production = pull_production()
        if args.setup:
            missing = missing_production(production)
            instructions = {
                'DATABASE_URL': 'enter the hosted PostgreSQL connection URL, not Docker',
                'DASHBOARD_PASSWORD': 'choose the password you will use to sign in to the production dashboard',
                'PUBLIC_APP_URL': 'enter the HTTPS domain shown on the Vercel Domains page',
            }
            for key in missing:
                print(f'Setting {key}: {instructions[key]}.', flush=True)
                cli(['env', 'add', key, '--environment', 'production', '--type', 'config' if key == 'PUBLIC_APP_URL' else 'secret'], staging, interactive=True)
            if missing:
                production = pull_production()
        validate_production(production)
        if args.preflight:
            print('Project and Production settings checked. No deployment made.')
            return
        print('Required production variables present; readable values validated. Deploying both containers…', flush=True)
        cli(['deploy', '--prod', '--yes'], staging)
        print('Checking production database health, API routing, and sign-in page…', flush=True)
        verify_deployment(production['PUBLIC_APP_URL'])
        print(f"Runtime verified: {production['PUBLIC_APP_URL']}")


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, OSError) as error:
        print(f'Deploy: {error}', file=sys.stderr)
        sys.exit(1)
