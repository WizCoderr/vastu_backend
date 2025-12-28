#!/bin/bash
cd ~/vastu_backend

# Stash local changes
git stash

# Pull latest code
git pull origin master

# Build and restart docker container
sudo docker compose down
sudo docker compose up -d --build