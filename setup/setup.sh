#!/bin/bash

cd "$1"
user="$2"
set -v

# Apt Repositories
cat > /etc/apt/sources.list.d/nodesource.list <<< 'deb https://deb.nodesource.com/node_6.x trusty main'
wget -qO - https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add -
add-apt-repository ppa:webupd8team/java
debconf-set-selections <<< 'oracle-java8-installer shared/accepted-oracle-license-v1-1 select true'
add-apt-repository ppa:git-core/ppa
apt-get update

# Packages
apt-get install -y vim python-software-properties
apt-get install -y unzip make g++ libxml2-dev libxslt1-dev python-dev python-oslo.config python-pip
apt-get install -y git
apt-get install -y oracle-java8-installer ant
apt-get install -y nodejs build-essential

# Eclipse
eclipse_major=neon
eclipse_minor=R
eclipse_dir="eclipse-$eclipse_major-$eclipse_minor"
eclipse_url="http://www.eclipse.org/downloads/download.php?r=1&file=/technology/epp/downloads/release/$eclipse_major/$eclipse_minor/eclipse-java-$eclipse_major-$eclipse_minor-linux-gtk-x86_64.tar.gz"
(
  cd /usr/local
  [ -d "$eclipse_dir" ] || (
    mkdir "$eclipse_dir"
    curl --location "$eclipse_url" | tar zx --strip-components=1 --directory "$eclipse_dir"
  )
  [ -h eclipse ] || ln -s "$eclipse_dir" eclipse
)

# SSL
(
  cd config
  # Fetch CA certificate
  [ -f ssl-ca.pem ] || wget -q -O - http://ca.mit.edu/mitClient.crt | openssl x509 -inform der -out ssl-ca.pem
  # Generate self-signed certificate
  [ -f ssl-private-key.pem ] || openssl genrsa -out ssl-private-key.pem 2048
  [ -f ssl-certificate.pem ] || openssl req -new -key ssl-private-key.pem -config openssl.conf | openssl x509 -req -signkey ssl-private-key.pem -out ssl-certificate.pem
)

# Time zone
cat > /etc/timezone <<< America/New_York
dpkg-reconfigure -f noninteractive tzdata
