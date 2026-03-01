db = db.getSiblingDB('swarmui');
db.createUser({
  user: 'swarmui',
  pwd: 'swarmui_password',
  roles: [{ role: 'readWrite', db: 'swarmui' }],
});
