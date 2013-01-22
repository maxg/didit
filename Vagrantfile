Vagrant::Config.run do |config|

  config.vm.box = "precise32"
  config.vm.box_url = "http://files.vagrantup.com/precise32.box"

  config.vm.customize [ "setextradata", :id,
                        "VBoxInternal2/SharedFoldersEnableSymlinksCreate/v-root", "1" ]

  config.vm.network :hostonly, "10.18.6.20"

  config.vm.provision :puppet

end
