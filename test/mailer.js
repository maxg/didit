var fs = require('fs');

describe('mailer', function() {
  
  var config = require('../config');
  var mailer = require('../mailer');
  
  describe('sendMail', function() {
    it('should send error email', function(done) {
      mailer.sendMail({
        to: [ 'alice.test' ], cc: [ 'bob.test' ]
      }, 'trouble', 'error', {
        level: 50, err: { msg: 'no good at all' }
      }, function(err, result) {
        var body = fs.readFileSync(result.path, { encoding: 'utf8' });
        body.should.contain('To: alice.test@' + config.mail.domain);
        body.should.contain('Cc: bob.test@' + config.mail.domain);
        body.should.match(/Subject:.*trouble/);
        body.should.match(/ERROR[^]*no good at all/);
        done(err);
      });
    });
    it('should send build email', function(done) {
      mailer.sendMail({
        to: [ 'alice.test' ]
      }, 'built', 'build', {
        spec: { kind: 'labs', proj: 'lab1', users: [ 'alice' ], rev: '1234def' }
      }, function(err, result) {
        var body = fs.readFileSync(result.path, { encoding: 'utf8' });
        body.should.match(/labs\/lab1.*alice.*1234def/);
        done(err);
      });
    });
  });
});
