#!/bin/bash
exec /Users/seohoseong/.local/bin/grok --always-approve --disable-web-search --no-subagents --max-turns 5 -m grok-4.6 "$@"
