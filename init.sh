#!/bin/bash

# Define variables
PROJECT_DIR="."
DOMAIN="decentralize.ooo"
EMAIL="draeder@gmail.com"
NGINX_CONTAINER="nginx" # Ensure this matches the name in your docker-compose.yml
APP_CONTAINER="nodejs_app" # Ensure this matches the name in your docker-compose.yml

# Start Nginx and App using initial nginx.conf
echo "Starting Nginx and App services with initial configuration..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" up -d

# Wait for Nginx to be fully up and serving the ACME challenge directory
echo "Waiting for Nginx to be ready..."
sleep 10  # Adjust if necessary

# Obtain SSL certificates with Certbot
echo "Obtaining SSL certificates for $DOMAIN..."
docker run -it --rm \
    -v "$PROJECT_DIR/data/certbot/conf:/etc/letsencrypt" \
    -v "$PROJECT_DIR/data/certbot/www:/var/www/certbot" \
    certbot/certbot certonly --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" --agree-tos --no-eff-email \
    --domain "$DOMAIN"

# Check if SSL certificates were obtained successfully
CERT_PATH="$PROJECT_DIR/data/certbot/conf/live/$DOMAIN/fullchain.pem"
if [ -f "$CERT_PATH" ]; then
    echo "SSL certificates obtained successfully."

    # Replace nginx.conf with nginx-ssl.conf to use the obtained SSL certificates
    echo "Switching to SSL configuration..."
    cp "$PROJECT_DIR/nginx-ssl.conf" "$PROJECT_DIR/nginx.conf"
    docker cp "$PROJECT_DIR/nginx.conf" $NGINX_CONTAINER:/etc/nginx/nginx.conf

    # Reload Nginx to apply the new configuration
    echo "Reloading Nginx..."
    docker exec $NGINX_CONTAINER nginx -s reload
else
    echo "Failed to obtain SSL certificates."
fi
