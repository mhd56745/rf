#!/bin/bash

# تثبيت Deno
curl -fsSL https://deno.land/install.sh | sh

# تثبيت deployctl
deno install -A --unstable https://deno.land/x/deploy/deployctl.ts

# تسجيل الدخول (مرة واحدة)
deployctl login

# نشر المشروع
deployctl deploy \
  --project=mbc-stream-proxy \
  --prod \
  --entrypoint=main.ts
