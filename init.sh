#!/bin/bash

# Define variables
PROJECT_DIR="."
DOMAIN="decentralize.ooo"
EMAIL="draeder@gmail.com"
WEBROOT_PATH="/var/www/certbot"

# Step 1: Start up the necessary services with Docker Compose
echo "Starting Nginx and App services..."
docker-compose -f "$PROJECT_DIR/docker-compose.yml" up -d nginx app

# Wait a moment to ensure Nginx is ready
sleep 10

# Step 2: Obtain or renew SSL certificates with Certbot
echo "Obtaining or renewing SSL certificates for $DOMAIN..."
docker run -it --rm \
    -v "$PROJECT_DIR/data/certbot/conf:/etc/letsencrypt" \
    -v "$PROJECT_DIR/data/certbot/www:$WEBROOT_PATH" \
    certbot/certbot certonly --non-interactive --agree-tos --email "$EMAIL" \
    --webroot --webroot-path="$WEBROOT_PATH" \
    --domain "$DOMAIN" \
    --http-01-port=80

# Check if SSL certificates were obtained successfully
if [ -f "$PROJECT_DIR/data/certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
    echo "SSL certificates obtained successfully."

    # Step 3: Update nginx configuration to use SSL certificates and reload Nginx
    echo "Configuring Nginx to use SSL certificates and reloading..."
    # Here you might programmatically update nginx.conf or switch to a pre-prepared SSL configuration
    # For simplicity, we'll just reload Nginx assuming the user has configured SSL in nginx.conf
    docker exec nginx nginx -s reload
    echo "Nginx reloaded with SSL configuration."
else
    echo "Failed to obtain SSL certificates."
fi

# Additional step: Automate renewal with a cron job or similar mechanism
