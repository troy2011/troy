// New-rule rooms use a separate namespace so older clients cannot become their hosts.
function tarotKingdomRoomRoots(roomId) {
    return String(roomId || '').startsWith('tkv37_')
        ? { rooms: 'tarotKingdomRoomsV37', matches: 'tarotKingdomMatchV37' }
        : { rooms: 'tarotKingdomRooms', matches: 'tarotKingdomMatch' };
}

module.exports = { tarotKingdomRoomRoots };
