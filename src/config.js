const aws = require('aws-sdk');
const fs = require('fs');
const moment = require('moment');

const env = process.env.NODE_ENV || 'development';
module.exports = require('../config/' + env);

module.exports.glob = {
  kind: (module.exports.student || {}).kinds ? '@('+module.exports.student.kinds.join('|')+')' : '*'
};

[ 'footer', 'swf' ].forEach(function(config) {
  module.exports[config] = JSON.parse(fs.readFileSync(`./config/${config}.json`), { encoding: 'utf8' });
});

aws.config.loadFromPath('./config/aws.json');

moment.updateLocale('en', {
  calendar: {
    lastDay: '[yesterday] LT',
    sameDay: '[today] LT',
    lastWeek: 'dddd LT',
    sameElse: 'lll'
  }
});
moment.compactFormat = 'YYYYMMDD[T]HHmmss';
moment.gitFormat = 'YYYY-MM-DD HH:mm';

process.nextTick(function() {
  // logger depends on us
  require('./logger').cat('config').info('using ' + env + ' configuration');
});
