# Update packages before installing
exec { 'apt-get update': command => '/usr/bin/apt-get update'; }
Exec['apt-get update'] -> Package <| |>

exec {
  'add-apt node':
    command => "wget -qO- https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add - && echo 'deb https://deb.nodesource.com/node_0.10 trusty main' > /etc/apt/sources.list.d/nodesource.list && apt-get update",
    path => [ '/usr/bin', '/bin' ],
    unless => '/usr/bin/test -f /etc/apt/sources.list.d/nodesource.list';
}

exec {
  'add-apt java':
    command => 'add-apt-repository ppa:webupd8team/java && apt-get update && echo oracle-java8-installer shared/accepted-oracle-license-v1-1 select true | /usr/bin/debconf-set-selections',
    path => [ '/usr/bin', '/bin' ],
    require => Package['python-software-properties'],
    unless => '/usr/bin/test -f /etc/apt/sources.list.d/webupd8team-java*.list';
}

exec {
  'add-apt git':
    command => 'add-apt-repository ppa:git-core/ppa && apt-get update',
    path => [ '/usr/bin', '/bin' ],
    require => Package['python-software-properties'],
    unless => '/usr/bin/test -f /etc/apt/sources.list.d/git-core-ppa*.list';
}

$eclipse_major='mars'
$eclipse_minor='R'
$eclipse_dir="/usr/local/eclipse-$eclipse_major-$eclipse_minor"
exec {
  'get eclipse':
    command => "mkdir $eclipse_dir && curl --location 'http://www.eclipse.org/downloads/download.php?r=1&file=/technology/epp/downloads/release/$eclipse_major/$eclipse_minor/eclipse-java-$eclipse_major-$eclipse_minor-linux-gtk-x86_64.tar.gz' | tar zx --strip-components=1 --directory $eclipse_dir",
    timeout => 600,
    path => [ '/bin', '/usr/bin' ],
    creates => "$eclipse_dir/eclipse";
}
file {
  '/usr/local/eclipse':
    ensure => 'link',
    target => $eclipse_dir;
}

package {
  [ 'vim', 'python-software-properties',
    'unzip', 'make', 'g++', 'libxml2-dev', 'libxslt1-dev', 'python-dev', 'python-oslo.config', 'python-pip' ]:
    ensure => 'installed';
  
  [ 'git' ]:
    ensure => 'installed',
    require => Exec['add-apt git'];
  
  [ 'oracle-java8-installer', 'ant' ]:
    ensure => 'installed',
    require => Exec['add-apt java'];
  
  [ 'nodejs' ]:
    ensure => 'installed',
    require => Exec['add-apt node'];
}

exec {
  'get bootstrap':
    command => 'wget -q http://getbootstrap.com/2.3.2/assets/bootstrap.zip -O bootstrap.zip && unzip bootstrap.zip && rm bootstrap.zip',
    path => [ '/bin', '/usr/bin' ],
    cwd => "$app_path/public/bootstrap",
    require => Package['nodejs', 'unzip'],
    creates => "$app_path/public/bootstrap/css/bootstrap.min.css";
}

# Generate SSL certificate
exec {
  'ssl certificate':
    command => 'openssl genrsa -out ssl-private-key.pem 2048 && openssl req -new -key ssl-private-key.pem -config openssl.conf | openssl x509 -req -signkey ssl-private-key.pem -out ssl-certificate.pem',
    path => '/usr/bin',
    cwd => "$app_path/config",
    creates => "$app_path/config/ssl-certificate.pem";
  
  'ssl ca':
    command => 'wget -q -O - http://ca.mit.edu/mitClient.crt | openssl x509 -inform der -out ssl-ca.pem',
    path => '/usr/bin',
    cwd => "$app_path/config",
    creates => "$app_path/config/ssl-ca.pem";
}

# Set time zone
file {
  '/etc/timezone':
    content => "America/New_York\n";
}
exec {
  'reconfigure tzdata':
    command => '/usr/sbin/dpkg-reconfigure tzdata',
    subscribe => File['/etc/timezone'],
    require => File['/etc/timezone'],
    refreshonly => true;
}

# Security updates
file {
  '/etc/apt/apt.conf.d/25auto-upgrades':
    content => 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";';
}
