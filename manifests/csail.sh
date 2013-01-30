#!/bin/bash

#
# CSAIL VM setup script.
#

node_ver='v0.8.18'
node_dist='linux-x64'

# Install packages
sudo apt-get update
sudo apt-get install vim git openjdk-6-jdk ant eclipse-jdt authbind

# Install Node.js
curl "http://nodejs.org/dist/$node_ver/node-$node_ver-$node_dist.tar.gz" | sudo tar zx --directory /usr/local
sudo ln -s "/usr/local/node-$node_ver-$node_dist/bin/node" /usr/local/bin/node
sudo ln -s "/usr/local/node-$node_ver-$node_dist/bin/node-waf" /usr/local/bin/node-waf
sudo ln -s "/usr/local/node-$node_ver-$node_dist/bin/npm" /usr/local/bin/npm
sudo mkdir -p /usr/local/share/man/man1
sudo ln -s "/usr/local/node-$node_ver-$node_dist/share/man/man1/node.1" /usr/local/share/man/man1/node.1

# Check out Didit
sudo mkdir /var/didit
sudo chown `whoami` /var/didit
git clone https://github.com/maxg/didit.git /var/didit

# Go to Didit directory
cd /var/didit

# Set ownership
sudo chown didit:`whoami` config log
sudo chmod o-rx config log

#
# For web
#

# Allow Didit to bind to HTTP and HTTPS ports
sudo touch /etc/authbind/byport/80
sudo chown didit /etc/authbind/byport/80
sudo chmod u+x /etc/authbind/byport/80
sudo touch /etc/authbind/byport/443
sudo chown didit /etc/authbind/byport/443
sudo chmod u+x /etc/authbind/byport/443

# Generate SSL certificates
openssl genrsa -out ssl-private-key.pem 1024 && openssl req -new -key ssl-private-key.pem -config config/openssl.conf | openssl x509 -req -signkey ssl-private-key.pem -out ssl-certificate.pem
wget -q -O - http://ca.mit.edu/mitClient.crt | openssl x509 -inform der -out ssl-ca.pem
