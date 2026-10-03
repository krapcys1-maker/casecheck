#!/usr/bin/env python3
"""Reviewed, narrowly scoped domain migration. Dry run unless --apply is supplied.

Requires root on the VPS. Does not edit portfolio files, app code or database.
Keeps nginx config ownership. Restores config and origin if activation fails.
"""
import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import subprocess
import time
from urllib.request import urlopen, Request

NEW_ORIGIN = 'https://inproduction.dev'
OLD_ORIGIN = 'https://astrologiapoludzku.com'
TARGET = Path('/etc/nginx/sites-available/inproduction')
OLD = Path('/etc/nginx/sites-available/landing')
ENV = Path('/home/web/casecheck-app.env')
MARKER = '    # BEGIN CaseCheck temporary interview panel'
OLD_MARKER = '    # CaseCheck: tymczasowy panel; strona i formularz zachowuja swoje trasy.\n'
CONTACT_MARKER = '    # formularz kontaktowy - maly serwis Pythona'
ANCHOR = '    location / {\n        try_files $uri $uri/ =404;\n    }'
PAGES = [NEW_ORIGIN + p for p in ['/', '/about/', '/contact/', '/projects/', '/articles/', '/pl/']]
PAGES += [OLD_ORIGIN + '/', OLD_ORIGIN + '/api/kontakt/zdrowie']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def build_configs(target, old, fragment):
    require(MARKER not in target and '/casecheck' not in target, 'Destination route already exists; review it first.')
    require(target.count(ANCHOR) == 1, 'Unexpected portfolio routing; no changes made.')
    require('server_name inproduction.dev www.inproduction.dev;' in target, 'Wrong destination host.')
    require(target.index(ANCHOR) < target.index('listen 443 ssl;'), 'Unexpected HTTPS block.')
    require(old.count(OLD_MARKER) == 1 and old.count(CONTACT_MARKER) == 1, 'Unexpected source routing.')
    start, end = old.index(OLD_MARKER), old.index(CONTACT_MARKER)
    source_routes = old[start:end]
    require(source_routes.count('location ') == 2 and 'proxy_pass http://127.0.0.1:8861;' in source_routes,
            'Source block includes unexpected routes.')
    new_target = target.replace(ANCHOR, fragment.rstrip() + '\n\n' + ANCHOR, 1)
    redirects = '''    # CaseCheck moved temporarily to the portfolio domain.
    location = /casecheck {
        return 307 https://inproduction.dev/casecheck/;
    }
    location ^~ /casecheck/ {
        add_header Cache-Control "no-store" always;
        return 307 https://inproduction.dev$request_uri;
    }

'''
    new_old = old[:start] + redirects + old[end:]
    require(new_target.replace(fragment.rstrip() + '\n\n', '', 1) == target, 'Unexpected destination changes.')
    return new_target, new_old


def request(url):
    with urlopen(Request(url, headers={'User-Agent': 'CaseCheck-domain-migration-check'}), timeout=15) as response:
        body = response.read()
        require(response.status == 200, 'HTTP check failed: ' + url)
        return {'status': response.status, 'sha256': sha(body)}


def site_manifest():
    result = {}
    for root in [Path('/var/www/inproduction'), Path('/var/www/landing')]:
        for entry in sorted(root.rglob('*')):
            if entry.is_file():
                result[str(entry)] = sha(entry.read_bytes())
    return result


def command(*args):
    subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)


def restart_app():
    account = pwd.getpwnam('web')
    command('/usr/sbin/runuser', '-u', 'web', '--', '/usr/bin/env',
            'XDG_RUNTIME_DIR=/run/user/' + str(account.pw_uid),
            '/usr/bin/systemctl', '--user', 'restart', 'casecheck-app')
    for attempt in range(15):
        try:
            request('http://127.0.0.1:8861/casecheck/healthz')
            return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError('Application health check failed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    for file in [TARGET, OLD]:
        require(file.is_file() and not file.is_symlink(), 'Expected ordinary nginx config file.')
    before = {TARGET: TARGET.read_bytes(), OLD: OLD.read_bytes()}
    fragment = (Path(__file__).parent / 'nginx-casecheck-inproduction.conf').read_text(encoding='utf-8')
    fragment = fragment[fragment.index(MARKER):]
    target, old = build_configs(before[TARGET].decode(), before[OLD].decode(), fragment)
    candidates = {TARGET: target.encode(), OLD: old.encode()}
    for file in [TARGET, OLD]:
        print(''.join(difflib.unified_diff(before[file].decode().splitlines(True),
              candidates[file].decode().splitlines(True), fromfile=str(file), tofile=str(file) + ' (proposed)')))
    if not args.apply:
        print('Dry run only. Activation also changes only CASECHECK_PUBLIC_ORIGIN and restarts casecheck-app.')
        return
    require(os.geteuid() == 0, 'Activation requires an administrator. No files changed.')
    require(ENV.is_file() and not ENV.is_symlink(), 'Expected ordinary application env file.')
    before[ENV] = ENV.read_bytes()
    env_text = before[ENV].decode()
    current = re.findall(r'^CASECHECK_PUBLIC_ORIGIN=(.*)$', env_text, flags=re.M)
    require(current == [OLD_ORIGIN], 'Unexpected current app origin; no files changed.')
    candidates[ENV] = re.sub(r'^CASECHECK_PUBLIC_ORIGIN=.*$', 'CASECHECK_PUBLIC_ORIGIN=' + NEW_ORIGIN,
                             env_text, flags=re.M).encode()
    command('/usr/sbin/nginx', '-t')
    pages = {url: request(url) for url in PAGES}
    files = site_manifest()
    backup = Path('/var/backups') / ('casecheck-domain-' + time.strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(mode=0o700)
    for path, content in before.items():
        destination = backup / path.name
        destination.write_bytes(content)
        destination.chmod(0o600)
    (backup / 'before.json').write_text(json.dumps({'pages': pages, 'files': files}, indent=2) + '\n')
    changed = []
    try:
        for path in [TARGET, OLD]:
            require(path.read_bytes() == before[path], 'Configuration changed concurrently.')
            changed.append(path)
            path.write_bytes(candidates[path])
        command('/usr/sbin/nginx', '-t')
        require(ENV.read_bytes() == before[ENV], 'Application environment changed concurrently.')
        changed.append(ENV)
        ENV.write_bytes(candidates[ENV])
        restart_app()
        command('/usr/bin/systemctl', 'reload', 'nginx')
        request(NEW_ORIGIN + '/casecheck/healthz')
        request(NEW_ORIGIN + '/casecheck/')
        require(site_manifest() == files, 'Website file hashes changed during migration.')
        require({url: request(url) for url in PAGES} == pages, 'Website responses changed during migration.')
        report = {'ok': True, 'url': NEW_ORIGIN + '/casecheck/', 'website_files_unchanged': len(files),
                  'website_routes_unchanged': len(pages), 'backup': str(backup), 'new_ai_calls': 0}
        (backup / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report))
    except BaseException:
        for path in changed:
            path.write_bytes(before[path])
        command('/usr/sbin/nginx', '-t')
        restart_app()
        command('/usr/bin/systemctl', 'reload', 'nginx')
        print('Activation failed; previous routing and app origin restored. Backup: ' + str(backup))
        raise


if __name__ == '__main__':
    main()
