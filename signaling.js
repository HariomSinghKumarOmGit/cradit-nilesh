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
    this._retryCount = 0;
    this._maxRetries = 5;
    this._retryDelay = 1500; // ms

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

  _setupChannelListeners(channel) {
    // Listen for broadcast messages (WebRTC signaling)
    channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      if (payload.from === this.myId) return;

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
    channel.on('presence', { event: 'sync' }, () => {
      if (!this.channel) return;
      const state = this.channel.presenceState();
      const presenceCount = Object.keys(state).length;
      console.log(`📡 Room presence: ${presenceCount} peer(s)`, state);

      if (presenceCount > 2) {
        this._fireCallback('room-full');
        this.supabase.removeChannel(this.channel);
        this.channel = null;
        return;
      }

      if (presenceCount === 2 && this.peerCount < 2) {
        console.log("🔔 Room ready — two peers present");

        // Determine who initiates: alphabetically greater ID creates the offer
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

    channel.on('presence', { event: 'leave' }, ({ key }) => {
      if (key !== this.myId) {
        console.log("🔴 Peer left the room");
        this._fireCallback('peer-left');
      }
    });
  }

  joinRoom(code) {
    this.roomCode = code;
    this._retryCount = 0;
    this._doJoinRoom(code);
  }

  _doJoinRoom(code) {
    // Clean up any existing channel
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.peerCount = 0;

    // Create a Supabase Realtime channel for this room
    const channel = this.supabase.channel(`eco-room-${code}`, {
      config: {
        broadcast: { self: false },
        presence: { key: this.myId }
      }
    });

    this._setupChannelListeners(channel);

    // Subscribe to the channel and track presence
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        this.channel = channel;
        this.connected = true;
        this._retryCount = 0;
        console.log(`🏠 Joined room: ${code}`);

        try {
          await channel.track({ user_id: this.myId, joined_at: Date.now() });
        } catch (err) {
          console.warn("⚠️ Presence track failed:", err);
        }

        this._fireCallback("connect");

      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        // Retry with exponential backoff instead of immediately firing error
        this._retryCount++;

        if (this._retryCount <= this._maxRetries) {
          const delay = this._retryDelay * this._retryCount;
          console.log(`🔄 Channel not ready, retrying in ${delay}ms (attempt ${this._retryCount}/${this._maxRetries})...`);

          // Clean up the failed channel
          this.supabase.removeChannel(channel);

          setTimeout(() => {
            if (this.roomCode === code) {
              this._doJoinRoom(code);
            }
          }, delay);
        } else {
          // All retries exhausted — fire the real error
          this.connected = false;
          console.error("❌ Signaling connection failed after all retries.");
          this._fireCallback('connect_error', { message: 'Channel disconnected' });
        }
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
    this.roomCode = null;
  }

  get id() {
    return this.myId;
  }
}
