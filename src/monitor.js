const async = require('async');
const dns = require('dns');
const https = require('https');
const moment = require('moment');
const nodemailer = require('nodemailer');
const url = require('url');

setTimeout(async.apply(report, 'Timed out'), 30000);
process.on('uncaughtException', async.apply(report, 'Monitor error'));

const didit = url.parse(process.env.DIDIT);

const transport = nodemailer.createTransport({
  transport: 'ses',
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

function fetchStatus(callback) {
  didit.path = '/status';
  didit.rejectUnauthorized = false;
  
  let req = https.get(didit);
  req.setTimeout(10000);
  
  req.on('response', function(res) {
    if (res.statusCode != 200) {
      return report('Error ' + res.statusCode + ' requesting status');
    }
    
    let json = '';
    res.on('data', function(data) { json += data; });
    res.on('end', function() {
      callback(JSON.parse(json));
    });
  });
  
  req.on('error', function(err) {
    return report('Error requesting status', err);
  });
}

fetchStatus(function(status) {
  
  // examine workflow statistics
  let stats = status.stats;
  
  // ... server should have current statistics
  let latest = moment(stats.interval.latestDate, 'X');
  let unit = 'minutes', maximum = 3;
  if (moment().subtract(maximum, unit).isAfter(latest)) {
    return report('Stats out of date', 'Stats more than ' + maximum + ' ' + unit + ' old');
  }
  
  // ... workflows should not be failing
  if (stats.failed > 0) {
    return report('Workflow failures', 'Workflow failure count: ' + stats.failed);
  }
  
  // ... we should not have a backlog
  if (stats.open > stats.completed + 1) {
    return report('[warning] Task backlog', 'Task backlog: ' + stats.open + ' open, ' + stats.completed + ' completed');
  }
  
  process.exit();
});

function report(title, message, err) {
  console.error('!!!', message);
  transport.sendMail({
    from: 'Didit Monitor <' + process.env.SENDER + '>',
    to: process.env.RECIPIENT,
    subject: '[didit alert] ' + title,
    text: 'Error at ' + moment().format() + ': ' + message,
  }, function(err, res) {
    if (err) { console.error(err); }
    process.exit(1);
  });
}
