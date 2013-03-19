var aws = require('aws-sdk');
var fs = require('fs');
var moment = require('moment');

var env = process.env.NODE_ENV || 'development';
module.exports = require('./config/' + env);

[ 'footer', 'swf' ].forEach(function(config) {
  module.exports[config] = JSON.parse(fs.readFileSync('./config/' + config + '.json'));
});

aws.config.loadFromPath('./config/aws.json');

moment.lang('en', {
  calendar: {
    lastDay: '[yesterday] LT',
    sameDay: '[today] LT',
    lastWeek: 'dddd LT',
    sameElse: 'lll'
  }
});

process.nextTick(function() {
  // logger depends on us
  require('./logger').cat('config').info('using ' + env + ' configuration');
});
