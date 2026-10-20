#!/usr/bin/env python3
"""Reject new PNG originals and removed HERMES source trees in the proposed Git tree."""
import subprocess
import sys


def git(*args):
    return subprocess.check_output(['git', *args]).decode().splitlines()


def check(base, head='HEAD'):
    files=git('ls-tree','-r','--name-only',head,'--','assets/hermes/originals/','hermes/quarantine/')
    changed=git('diff','--no-renames','--name-only','--diff-filter=ACMR',base,head)
    bad=sorted(set(files+[p for p in changed if p.lower().endswith('.png')]))
    if bad:
        raise SystemExit('MINOTAURUS: original assets prohibited: '+', '.join(bad[:10]))
    print('MINOTAURUS_GUARD_OK: no original trees or new/modified PNGs')

if __name__=='__main__':
    if len(sys.argv)!=3:raise SystemExit('Usage: minotaurus_guard.py BASE HEAD')
    check(*sys.argv[1:])
