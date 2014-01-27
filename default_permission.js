var logger = require('./logger');
var log = logger.cat('permission');

exports.setStartingPermission = function(spec, callback) {
	log.info({ spec: spec }, 'setStartingPermission');
	log.warn('No permission file specified. Not setting starting directory permissions.');
	//console.log('This would set global read permissions for '+spec.kind+'/'+spec.proj);
	callback();
};

exports.setStudentPermission = function(spec, callback) {
	log.info({ spec: spec }, 'setStudentPermission');
	log.warn('No permission file specified. Not setting student repo permissions.')
	//console.log('This would remove global read permissions for '+spec.kind+'/'+spec.proj+
	//	'/'+spec.users.join('-'));
	//console.log('This would set write permissions for the users');
	callback();
};
