var fs = require('fs');
var https = require('https');

var config = require('./config');

var decider = require('./decider');
decider.createServer(function() {
  console.log('[web]', 'decider started');
});

var web = require('./frontend');
var ssl = {
  key: fs.readFileSync('./ssl-private-key.pem'),
  cert: fs.readFileSync('./ssl-certificate.pem'),
  ca: [ fs.readFileSync('./ssl-ca.pem') ],
  requestCert: true
};
https.createServer(ssl, web).listen(config.web.port, function() {
  console.log('[web]', 'web started on HTTPS port ' + config.web.port);
});
