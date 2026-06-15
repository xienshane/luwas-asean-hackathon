#!/bin/bash

# Check if the commit message is empty
if [ -z "$1" ]; then
  echo "Error: Please provide a commit message."
  echo "Usage: ./commit.sh \"Your message here\""
  exit 1
fi

git add .
git commit -m "$1"
