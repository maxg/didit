#!/bin/bash

#
# CSAIL VM setup script.
#

node_ver='v0.10.17'
node_dist='linux-x64'

# Install packages
echo "# WebUpd8 Team Oracle Java Installer PPA
deb http://ppa.launchpad.net/webupd8team/java/ubuntu precise main
deb-src http://ppa.launchpad.net/webupd8team/java/ubuntu precise main
" | sudo tee -a /etc/apt/sources.list.d/webupd8team-java.list
sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys EEA14886
sudo apt-get update
sudo apt-get install vim git oracle-java7-installer ant authbind

# Install Eclipse
eclipse_ver='kepler-SR1'
eclipse_dist='linux-gtk-x86_64'
eclipse="http://www.eclipse.org/downloads/download.php?file=/technology/epp/downloads/release/${eclipse_ver/-//}/eclipse-standard-$eclipse_ver-$eclipse_dist.tar.gz&r=1"
sudo mkdir "/usr/local/eclipse-$eclipse_ver"
curl --location "$eclipse" | sudo tar zx --strip-components=1 --directory "/usr/local/eclipse-$eclipse_ver"

# Install Node.js
curl "http://nodejs.org/dist/$node_ver/node-$node_ver-$node_dist.tar.gz" | sudo tar zx --directory /usr/local
sudo ln -s -f "/usr/local/node-$node_ver-$node_dist/bin/node" /usr/local/bin/node
sudo ln -s -f "/usr/local/node-$node_ver-$node_dist/bin/node-waf" /usr/local/bin/node-waf
sudo ln -s -f "/usr/local/node-$node_ver-$node_dist/bin/npm" /usr/local/bin/npm
sudo mkdir -p /usr/local/share/man/man1
sudo ln -s -f "/usr/local/node-$node_ver-$node_dist/share/man/man1/node.1" /usr/local/share/man/man1/node.1

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
sudo chown didit:`whoami` ssl-*
sudo chmod o-r ssl-*

# Go to Bootstrap directory
cd /var/didit/public/bootstrap

# Download Bootstrap
wget -q --post-data=`node -pe "require('../../config/bootstrap.js')"` http://bootstrap.herokuapp.com -O bootstrap.zip
unzip bootstrap.zip
rm bootstrap.zip
