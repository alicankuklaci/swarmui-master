db = db.getSiblingDB('swarmui-master');
db.createUser({
  user: 'swarmui-master',
  pwd: 'swarmui-master_password',
  roles: [{ role: 'readWrite', db: 'swarmui-master' }],
});
