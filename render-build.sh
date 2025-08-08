#!/usr/bin/env bash
set -e

echo "==== Cleaning node_modules and cache ===="
rm -rf node_modules
rm -rf package-lock.json
npm cache clean --force

echo "==== Installing dependencies ===="
npm install

echo "==== Rebuilding native modules ===="
npm rebuild

echo "==== Build complete ===="
