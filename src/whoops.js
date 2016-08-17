const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const pug = require('pug');

const config = require('./config');
const logger = require('./logger');
const log = logger.cat('whoops');

const app = express();

app.set('view engine', 'pug');

app.use('/static', express.static(path.join(__dirname, '..', 'public')));
app.use(logger.express());

app.get('*', function(req, res) {
  res.render('whoops');
});

app.post('*', function(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Sorry, Didit server is down for maintenance\n');
});

exports.start = function() {
  let ssl = {
    key: fs.readFileSync('./config/ssl-private-key.pem'),
    cert: fs.readFileSync('./config/ssl-certificate.pem'),
    ca: fs.readdirSync('./config')
          .filter(f => /ssl-ca|ssl-intermediate/.test(f))
          .map(f => fs.readFileSync('./config/' + f)),
  };
  exports.server = https.createServer(ssl, app).listen(config.web.port, function() {
    log.info('whoops started on HTTPS port ' + config.web.port);
  });
  
  if (config.web.redirect) {
    let redirect = require('./redirect');
    exports.redirector = http.createServer(redirect).listen(config.web.redirect, function() {
      log.info('redirect started on HTTP port ' + config.web.redirect);
    });
  }
};

exports.stop = function() {
  exports.server.close();
  if (exports.redirector) { exports.redirector.close(); }
};

if (require.main === module) {
  exports.start();
}
