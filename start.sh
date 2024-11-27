#!/bin/bash

export VENDOR=LivelyVideo
export COMPANY=lively
export HOST=0.0.0.0
export PORT=3000

npm run generate-docs

npx docusaurus start --host 0.0.0.0 --port 3000