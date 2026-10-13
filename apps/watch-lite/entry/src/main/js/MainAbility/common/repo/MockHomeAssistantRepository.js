// Legacy mock kept ES5-only (callbacks, no Promise/class) until the design-conform mock lands (PR 3b).
function MockHomeAssistantRepository() {}

MockHomeAssistantRepository.prototype.sync = function (callback) {
    callback(null, [
        { entity_id: 'light.kitchen', name: 'Kitchen', state: 'off', domain: 'light' },
        { entity_id: 'switch.router', name: 'Router', state: 'on', domain: 'switch' },
        { entity_id: 'lock.front_door', name: 'Front door', state: 'locked', domain: 'lock' }
    ]);
};

MockHomeAssistantRepository.prototype.runAction = function (action, callback) {
    callback(null, true);
};

export default MockHomeAssistantRepository;
