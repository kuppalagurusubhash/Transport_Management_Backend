let _io = null;

export const setSocketIo = (io) => {
  _io = io;
};

export const getSocketIo = () => _io;

/**
 * Broadcast an event to all connected socket clients.
 * @param {string} event - The event name (e.g. 'order:created')
 * @param {any} data - Payload to send
 */
export const broadcastEvent = (event, data) => {
  if (_io) {
    _io.emit(event, data);
  }
};
