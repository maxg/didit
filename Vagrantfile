Vagrant.configure("2") do |config|

  config.vm.box = "precise32"
  config.vm.box_url = "http://files.vagrantup.com/precise32.box"

  config.vm.provider :virtualbox do |vb|
    vb.customize [ "setextradata", :id,
                   "VBoxInternal2/SharedFoldersEnableSymlinksCreate/v-root", "1" ]
  end

  config.vm.network :private_network, ip: "10.18.6.20"

  config.vm.provision :puppet do |puppet|
    puppet.facter = { "app_path" => "/vagrant" }
  end

end
