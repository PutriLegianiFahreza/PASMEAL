#!/usr/bin/env bash
set -e

echo "==== Cleaning node_modules and cache ===="
rm -rf node_modules
rm -rf ~/.npm
rm -rf ~/.cache

echo "==== Installing dependencies ===="
npm ci --ignore-scripts

echo "==== Rebuilding native modules ===="
npm rebuild

echo "==== Build complete ===="
