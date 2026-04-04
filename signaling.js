/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SENTINOID ECO — SUPABASE REALTIME SIGNALING
   Replaces Socket.io with Supabase Realtime Channels.
   This works on Vercel because Supabase handles the WebSocket
   connection — no persistent server needed!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

class SignalingClient {
  constructor(supabaseUrl, supabaseKey) {
    // Initialize Supabase client for Realtime only
    this.supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
      realtime: {
        params: { eventsPerSecond: 20 }
      }
    });
    this.channel = null;
    this.roomCode = null;
    this.myId = this._generateId();
    this.callbacks = {};
    this.connected = false;
    this.peerCount = 0;

    console.log("✅ Signaling client initialized (Supabase Realtime). My ID:", this.myId);
  }

  _generateId() {
    return 'eco_' + Math.random().toString(36).substring(2, 10);
  }

  on(event, callback) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(callback);
  }

  _fireCallback(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => cb(data));
    }
  }

  joinRoom(code) {
    this.roomCode = code;

    // Clean up any existing channel
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
    }

    // Create a Supabase Realtime channel for this room
    this.channel = this.supabase.channel(`eco-room-${code}`, {
      config: {
        broadcast: { self: false },
        presence: { key: this.myId }
      }
    });

    // Listen for broadcast messages
    this.channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      if (payload.from === this.myId) return; // Ignore own messages

      switch (payload.type) {
        case 'offer':
          console.log("🔔 Received offer from peer");
          this._fireCallback('offer', payload.data);
          break;
        case 'answer':
          console.log("🔔 Received answer from peer");
          this._fireCallback('answer', payload.data);
          break;
        case 'ice-candidate':
          this._fireCallback('ice-candidate', payload.data);
          break;
      }
    });

    // Track presence to know when peers join/leave
    this.channel.on('presence', { event: 'sync' }, () => {
      const state = this.channel.presenceState();
      const presenceCount = Object.keys(state).length;
      console.log(`📡 Room presence: ${presenceCount} peer(s)`, state);

      if (presenceCount > 2) {
        // Room is full — more than 2 peers
        this._fireCallback('room-full');
        this.supabase.removeChannel(this.channel);
        this.channel = null;
        return;
      }

      if (presenceCount === 2 && this.peerCount < 2) {
        // Second peer just joined — initiate WebRTC
        console.log("🔔 Room ready — two peers present");

        // Determine who initiates: the peer whose ID is alphabetically greater creates the offer
        const peerIds = Object.keys(state).sort();
        const iAmInitiator = peerIds[1] === this.myId;

        if (iAmInitiator) {
          console.log("🔔 I am the initiator — creating offer...");
          this._fireCallback('ready');
        } else {
          console.log("🔔 I am the responder — waiting for offer...");
          this._fireCallback('peer-joined');
        }
      }

      this.peerCount = presenceCount;
    });

    this.channel.on('presence', { event: 'leave' }, ({ key }) => {
      if (key !== this.myId) {
        console.log("🔴 Peer left the room");
        this._fireCallback('peer-left');
      }
    });

    // Subscribe to the channel and track presence
    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        this.connected = true;
        console.log(`🏠 Joined room: ${code}`);
        await this.channel.track({ user_id: this.myId, joined_at: Date.now() });
        // Fire connect callback after room is joined
        this._fireCallback("connect");
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        this.connected = false;
        console.warn("⚠️ Channel error or closed");
        this._fireCallback('connect_error', { message: 'Channel disconnected' });
      }
    });
  }

  // Send signaling data through Supabase broadcast
  emit(event, data) {
    if (!this.channel) {
      console.warn("⚠️ No channel — cannot emit", event);
      return;
    }

    let payload;
    if (event === 'join-room') {
      this.joinRoom(data);
      return;
    }

    // For offer, answer, ice-candidate — data has { code, data }
    if (typeof data === 'object' && data.code && data.data) {
      payload = { type: event, data: data.data, from: this.myId };
    } else {
      payload = { type: event, data: data, from: this.myId };
    }

    this.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: payload
    });
  }

  disconnect() {
    if (this.channel) {
      this.channel.untrack();
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.connected = false;
  }

  get id() {
    return this.myId;
  }
}
