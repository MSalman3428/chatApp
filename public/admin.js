// admin.js

// --- MessageStore ---
class MessageStore {
  constructor() {
    this.messageHistory = {};
  }
  storeMessage(email, message) {
    if (!this.messageHistory[email]) this.messageHistory[email] = [];
    this.messageHistory[email].push(message);
  }
  getMessages(email) {
    return this.messageHistory[email] || [];
  }
}

// Remove the existing AudioRecorder class and replace with:
class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.isRecording = false;
    this.isPaused = false;
  }

  async startRecording() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        },
      });

      let options = {};
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        options = { mimeType: "audio/webm;codecs=opus" };
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        options = { mimeType: "audio/webm" };
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        options = { mimeType: "audio/mp4" };
      } else {
        console.log("Using browser default audio format");
      }

      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.audioChunks = [];
      this.isRecording = true;
      this.isPaused = false;

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
          console.log("AudioRecorder: Data chunk received, size:", e.data.size);
        }
      };

      this.mediaRecorder.start(1000);
      console.log(
        "AudioRecorder: Recording started with format:",
        this.mediaRecorder.mimeType
      );
      return true;
    } catch (err) {
      console.error("AudioRecorder: Error starting recording:", err);
      let errorMessage =
        "Microphone access denied. Please allow microphone access in your browser settings.";

      if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        errorMessage = "No microphone found. Please connect a microphone.";
      } else if (
        err.name === "NotReadableError" ||
        err.name === "TrackStartError"
      ) {
        errorMessage = "Microphone is already in use or cannot be accessed.";
      } else if (err.name === "NotAllowedError") {
        errorMessage =
          "Microphone permission denied. Please allow microphone access.";
      }

      alert(errorMessage);
      return false;
    }
  }

  pauseRecording() {
    if (
      this.isRecording &&
      !this.isPaused &&
      this.mediaRecorder &&
      this.mediaRecorder.state === "recording"
    ) {
      this.mediaRecorder.pause();
      this.isPaused = true;
      console.log("AudioRecorder: Recording paused.");
    }
  }

  resumeRecording() {
    if (
      this.isRecording &&
      this.isPaused &&
      this.mediaRecorder &&
      this.mediaRecorder.state === "paused"
    ) {
      this.mediaRecorder.resume();
      this.isPaused = false;
      console.log("AudioRecorder: Recording resumed.");
    }
  }

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.isRecording || !this.mediaRecorder) {
        console.log("AudioRecorder: Not recording, returning null.");
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        console.log(
          "AudioRecorder: Recording stopped. Total chunks:",
          this.audioChunks.length
        );

        if (this.audioChunks.length === 0) {
          console.warn("AudioRecorder: No audio chunks recorded.");
          resolve(null);
          return;
        }

        const mimeType = this.mediaRecorder.mimeType || "audio/webm";
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        console.log(
          "AudioRecorder: Created blob, size:",
          audioBlob.size,
          "type:",
          mimeType
        );

        if (this.stream) {
          this.stream.getTracks().forEach((track) => {
            if (track.readyState === "live") {
              track.stop();
              console.log("AudioRecorder: Track stopped.");
            }
          });
        }

        this.isRecording = false;
        this.isPaused = false;
        this.audioChunks = [];
        this.mediaRecorder = null;
        this.stream = null;
        resolve(audioBlob);
      };

      if (
        this.mediaRecorder.state === "recording" ||
        this.mediaRecorder.state === "paused"
      ) {
        this.mediaRecorder.stop();
      } else {
        console.warn(
          "AudioRecorder: MediaRecorder not in valid state:",
          this.mediaRecorder.state
        );
        resolve(null);
      }
    });
  }
}
class VoiceModule {
  constructor(uiCallbacks) {
    this.audioRecorder = new AudioRecorder();
    this.uiCallbacks = uiCallbacks;
  }

  resetVoiceUI() {
    this.uiCallbacks.toggleVoiceControls(false);
    this.uiCallbacks.updatePauseButtonIcon(false);
    this.uiCallbacks.stopWaveAnimation();
  }

  stopRecording(shouldSend, sendCallback) {
    if (!this.audioRecorder.isRecording) {
      this.resetVoiceUI();
      return Promise.resolve(null);
    }

    return this.audioRecorder.stopRecording().then((audioBlob) => {
      if (!shouldSend || !audioBlob) {
        this.resetVoiceUI();
        return null;
      }

      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onloadend = () => {
          const base64Audio = reader.result;
          sendCallback(base64Audio);
          this.resetVoiceUI();
          resolve(true);
        };
        reader.readAsDataURL(audioBlob);
      });
    });
  }

  init(sendVoiceMessageCallback, connectionStatusChecker) {
    const voiceButton = document.getElementById("voiceButton");
    const pauseBtn = document.getElementById("pauseBtn");
    const deleteVoiceBtn = document.getElementById("deleteVoiceBtn");

    if (voiceButton) {
      voiceButton.addEventListener(
        "click",
        async (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          console.log("Voice button clicked");

          if (!connectionStatusChecker()) {
            this.uiCallbacks.displaySystemMessage(
              "Please connect to chat first to send voice messages."
            );
            return;
          }

          const success = await this.audioRecorder.startRecording();
          if (success) {
            this.uiCallbacks.toggleVoiceControls(true);
            this.uiCallbacks.startWaveAnimation();
          } else {
            this.uiCallbacks.displaySystemMessage(
              "Microphone access denied. Please allow access."
            );
          }
        },
        true
      );
    }

    if (pauseBtn) {
      pauseBtn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          console.log("Pause button clicked");

          if (!this.audioRecorder.isRecording) return;

          if (this.audioRecorder.isPaused) {
            this.audioRecorder.resumeRecording();
            this.uiCallbacks.updatePauseButtonIcon(false);
            this.uiCallbacks.startWaveAnimation();
          } else {
            this.audioRecorder.pauseRecording();
            this.uiCallbacks.updatePauseButtonIcon(true);
            this.uiCallbacks.stopWaveAnimation();
          }
        },
        true
      );
    }

    if (deleteVoiceBtn) {
      deleteVoiceBtn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          console.log("Delete voice button clicked");
          this.stopRecording(false, sendVoiceMessageCallback);
        },
        true
      );
    }
  }

  get isRecording() {
    return this.audioRecorder.isRecording;
  }
}
// --- WebSocketManager ---
class WebSocketManager {
  constructor(url, messageHandlers) {
    this.socket = new WebSocket(url);
    this.messageHandlers = messageHandlers;
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.socket.onopen = () => this.messageHandlers.onOpen?.();
    this.socket.onerror = (error) => this.messageHandlers.onError?.(error);
    this.socket.onclose = (event) => this.messageHandlers.onClose?.(event);
    this.socket.onmessage = (event) => this.handleMessage(event);
  }

  handleMessage(event) {
    try {
      this.messageHandlers.onMessage?.(JSON.parse(event.data));
    } catch (e) {
      console.error("Failed to parse WebSocket message:", e, event.data);
    }
  }

  send(data) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
      return true;
    }
    console.warn("WebSocket not open. ReadyState:", this.socket.readyState);
    return false;
  }

  close() {
    try {
      this.socket.close();
    } catch {}
  }
}

// --- ChatUI ---
class ChatUI {
  constructor(elements) {
    this.elements = elements;
    this.initEmojiPicker();
    this.messageSound = document.getElementById("notificationSound");
    this.waveAnimationFrame = null;
    this.waveAnimating = false;
    this.waveBars = elements.voiceWave
      ? Array.from(elements.voiceWave.querySelectorAll(".bar"))
      : [];
  }

  // Add these voice-related methods:
  toggleVoiceControls(isRecordingActive) {
    if (this.elements.messageInput) {
      this.elements.messageInput.style.display = isRecordingActive
        ? "none"
        : "block";
    }
    if (this.elements.voiceControls) {
      this.elements.voiceControls.style.display = isRecordingActive
        ? "flex"
        : "none";
    }
    if (this.elements.voiceButton) {
      this.elements.voiceButton.style.display = isRecordingActive
        ? "none"
        : "inline-block";
    }
    if (this.elements.attachFileButton) {
      this.elements.attachFileButton.style.display = isRecordingActive
        ? "none"
        : "inline-block";
    }
    if (this.elements.emojiButton) {
      this.elements.emojiButton.style.display = isRecordingActive
        ? "none"
        : "inline-block";
    }
  }

  updatePauseButtonIcon(isPaused) {
    if (this.elements.pauseBtn) {
      const pauseIcon = this.elements.pauseBtn.querySelector("img");
      if (pauseIcon) {
        pauseIcon.src = isPaused ? "./icons/voice.svg" : "./icons/pause.svg";
      }
    }
  }

  startWaveAnimation() {
    if (this.waveAnimating) return;
    this.waveAnimating = true;
    this.animateWaves();
  }

  stopWaveAnimation() {
    this.waveAnimating = false;
    if (this.waveAnimationFrame) {
      cancelAnimationFrame(this.waveAnimationFrame);
    }
    this.waveBars.forEach((bar) => (bar.style.height = "5px"));
  }

  animateWaves() {
    if (!this.waveAnimating) return;
    this.waveBars.forEach((bar, i) => {
      const scale = 1 + Math.sin(Date.now() / 200 + i) * 1.5;
      bar.style.height = `${Math.max(4, scale * 10)}px`;
    });
    this.waveAnimationFrame = requestAnimationFrame(
      this.animateWaves.bind(this)
    );
  }

 // Replace your current appendVoiceMessage with this improved version
appendVoiceMessage(content, sender, isMyMessage, fileName, timestamp) {
    const msg = document.createElement("div");
    msg.className = `message-bubble ${isMyMessage ? "my-message" : "user-message"}`;

    const date = new Date(timestamp);
    const timeString = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });

    const senderLabel = document.createElement("div");
    senderLabel.className = "message-sender";
    senderLabel.textContent = isMyMessage ? `You` : `${sender}`;

    msg.appendChild(senderLabel);

    // Create container for audio element
    const audioContainer = document.createElement("div");
    audioContainer.className = "message-content voice-message-container";
    
    // Create audio element
    const audioElement = document.createElement("audio");
    audioElement.controls = true;
    audioElement.src = content;
    audioElement.className = "voice-player";
    
    // Add audio element to container
    audioContainer.appendChild(audioElement);
    
    // Create timestamp element
    const timeElement = document.createElement("div");
    timeElement.className = "message-time";
    timeElement.textContent = timeString;
    
    // Add elements to message bubble
    msg.appendChild(audioContainer);
    msg.appendChild(timeElement);
    
    this.elements.messagesContainer.appendChild(msg);
    this.scrollToBottom();
}

  playMessageSound() {
    if (this.messageSound) {
      this.messageSound.currentTime = 0;
      this.messageSound.play().catch((e) => {
        console.warn("Audio playback failed:", e);
      });
    }
  }

  displaySystemMessage(content) {
    const msg = document.createElement("div");
    msg.className = "message-bubble system-message";
    msg.textContent = content;
    this.elements.messagesContainer.appendChild(msg);
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.elements.messagesContainer.scrollTop =
      this.elements.messagesContainer.scrollHeight;
  }

  appendMessage(content, sender, isMyMessage, timestamp) {
    const el = this.createMessageElement(
      content,
      sender,
      isMyMessage,
      timestamp
    );
    this.elements.messagesContainer.appendChild(el);
    this.scrollToBottom();
  }

  createMessageElement(content, sender, isMyMessage, timestamp) {
    const messageEl = document.createElement("div");
    messageEl.className = `message-bubble ${
      isMyMessage ? "my-message" : "user-message"
    }`;

    const senderLabel = document.createElement("div");
    senderLabel.className = "message-sender";
    senderLabel.textContent = isMyMessage ? "You" : sender;

    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    contentDiv.textContent = content;

    const timeLabel = document.createElement("div");
    timeLabel.className = "message-time";
    const date = new Date(timestamp);
    timeLabel.textContent = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    messageEl.appendChild(senderLabel);
    messageEl.appendChild(contentDiv);
    messageEl.appendChild(timeLabel);

    return messageEl;
  }

  updateOnlineUserList(users) {
    this.elements.partnerList.innerHTML = "";

    // Admin shouldn't see themselves; also hide other admins if you want 1:1 with users only
    const filtered = users.filter(
      (u) => u.email !== "admin@example.com" && u.type === "user"
    );

    if (filtered.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No users online";
      this.elements.partnerList.appendChild(li);
      return;
    }

    filtered.forEach((user) => {
      const li = document.createElement("li");
      li.classList.add("user-item");
      li.dataset.email = user.email;
      li.innerHTML = `
        <div class="user-name">${user.name}</div>
        <div class="user-email">${user.email}</div>
      `;
      this.elements.partnerList.appendChild(li);
    });
  }

  switchToChatView(userName) {
    this.elements.userListView.style.display = "none";
    this.elements.chatView.style.display = "flex";
    this.elements.backToUsers.style.display = "inline-block";
    this.elements.activeUserDisplay.textContent = userName;
    this.clearMessages();
  }

  switchToUserListView() {
    this.elements.userListView.style.display = "block";
    this.elements.chatView.style.display = "none";
    this.elements.backToUsers.style.display = "none";
    this.elements.activeUserDisplay.textContent = "Admin";
    this.clearMessages();
    this.displaySystemMessage("Select a user to start chatting");
  }

  clearMessages() {
    this.elements.messagesContainer.innerHTML = "";
  }

  initEmojiPicker() {
    const emojis = [
      "😀",
      "😁",
      "😂",
      "🤣",
      "😃",
      "🥳",
      "👏",
      "🤔",
      "👍",
      "❤️",
      "🔥",
      "🚀",
      "🤩",
    ];
    this.elements.emojiPicker.innerHTML = emojis
      .map((emoji) => `<span data-emoji="${emoji}">${emoji}</span>`)
      .join("");

    this.elements.emojiPicker.style.display = "none";

    this.elements.emojiPicker.addEventListener("click", (e) => {
      if (e.target.tagName === "SPAN") {
        this.addEmojiToInput(e.target.dataset.emoji);
      }
    });

    this.elements.emojiButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleEmojiPicker();
    });

    document.addEventListener("click", (e) => {
      if (!this.isEmojiPickerElement(e.target)) {
        this.hideEmojiPicker();
      }
    });
  }

  toggleEmojiPicker() {
    this.elements.emojiPicker.style.display =
      this.elements.emojiPicker.style.display === "none" ? "flex" : "none";
  }

  hideEmojiPicker() {
    this.elements.emojiPicker.style.display = "none";
  }

  isEmojiPickerElement(target) {
    return (
      target === this.elements.emojiButton ||
      this.elements.emojiPicker.contains(target)
    );
  }

  addEmojiToInput(emoji) {
    this.elements.messageInput.value += emoji;
    this.elements.messageInput.focus();
    this.hideEmojiPicker();
  }
}

// --- NetworkManager ---
class NetworkManager {
  constructor() {
    this.socketManager = null;
  }

  connect(url, admin, messageHandler) {
    this.socketManager = new WebSocketManager(url, {
      onOpen: () => this.handleOpen(admin),
      onError: (error) => console.error("WebSocket error:", error),
      onClose: (event) => this.handleClose(event),
      onMessage: (data) => messageHandler(data),
    });
    return this.socketManager;
  }

  handleOpen(admin) {
    console.log("Connected as Admin");
    this.send({
      type: "admin-info",
      name: admin.name,
      email: admin.email,
    });
  }

  handleClose(event) {
    console.log("WebSocket closed:", event);
  }

  send(data) {
    return this.socketManager?.send(data) ?? false;
  }

  close() {
    this.socketManager?.close();
  }
}


class ChatApp {
  constructor(elements) {
    this.admin = { name: "Admin", email: "admin@example.com" };
    this.selectedUser = null;
    this.messageStore = new MessageStore();
    this.network = new NetworkManager();
    this.ui = new ChatUI(elements);
    this.domElements = elements;
    
    // Initialize voice module
    this.voiceModule = new VoiceModule({
      toggleVoiceControls: this.ui.toggleVoiceControls.bind(this.ui),
      updatePauseButtonIcon: this.ui.updatePauseButtonIcon.bind(this.ui),
      displaySystemMessage: this.ui.displaySystemMessage.bind(this.ui),
      startWaveAnimation: this.ui.startWaveAnimation.bind(this.ui),
      stopWaveAnimation: this.ui.stopWaveAnimation.bind(this.ui),
    });
    
    this.init();
    this.setupVoiceControls();
  }

  init() {
    this.connectToChat();
    this.setupEventListeners();
    this.ui.displaySystemMessage("Connecting as Admin...");
  }

  connectToChat() {
    this.network.connect("ws://localhost:3000", this.admin, (data) =>
      this.handleIncomingMessage(data)
    );
  }

  setupEventListeners() {
    this.domElements.sendButton?.addEventListener("click", (e) =>
      this.handleSendMessage(e)
    );

    this.domElements.messageInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage(e);
      }
    });

    this.domElements.partnerList?.addEventListener("click", (e) =>
      this.handleUserSelection(e)
    );

    this.domElements.backToUsers?.addEventListener("click", () =>
      this.showUserList()
    );
  }

  setupVoiceControls() {
    this.voiceModule.init(
      this.sendVoiceMessage.bind(this),
      this.isConnected.bind(this)
    );
  }

  isConnected() {
    return this.network.socketManager && 
           this.network.socketManager.socket.readyState === WebSocket.OPEN;
  }

  sendVoiceMessage(base64Audio) {
    if (!this.selectedUser) {
      this.ui.displaySystemMessage("Please select a user first");
      return;
    }

    const timestamp = new Date().toISOString();
    const messageData = {
      type: "admin-voice",
      content: base64Audio,
      fileName: `voice_message_${Date.now()}.webm`,
      fileType: "audio/webm",
      sender: this.admin.name,
      recipient: this.selectedUser.email,
      senderEmail: this.admin.email,
      timestamp,
    };

    if (this.network.send(messageData)) {
      console.log("Voice message sent to server");
    } else {
      this.ui.displaySystemMessage("Failed to send voice message");
    }
  }

  handleIncomingMessage(data) {
    switch (data.type) {
      case "user-message":
      case "admin-message":
        this.handleUserMessage(data);
        break;
      case "user-voice":
      case "admin-voice":
        this.handleVoiceMessage(data);
        break;
      case "system-message":
        this.ui.displaySystemMessage(data.content);
        break;
      case "user-list": {
        const others = data.users.filter((u) => u.email !== this.admin.email);
        this.ui.updateOnlineUserList(others);
        break;
      }
      case "chat-history":
        this.loadChatHistory(data.messages);
        break;
      default:
        console.warn("Unknown message type:", data.type);
    }
  }

  handleVoiceMessage(data) {
    const isMyMessage = data.senderEmail === this.admin.email;
    const isSenderSelected = this.selectedUser?.email === data.senderEmail;

    if (
      !isMyMessage &&
      (isSenderSelected ||
        (!this.selectedUser && data.recipient === this.admin.email))
    ) {
      this.ui.playMessageSound();
    }

    if (isSenderSelected || (isMyMessage && this.selectedUser?.email === data.recipient)) {
      this.ui.appendVoiceMessage(
        data.content,
        isMyMessage ? "You" : data.sender,
        isMyMessage,
        data.fileName,
        data.timestamp
      );
    }

    this.messageStore.storeMessage(
      isMyMessage ? data.recipient : data.senderEmail,
      {
        sender: data.sender,
        content: data.content,
        isMyMessage,
        isVoice: true,
        fileName: data.fileName,
        timestamp: data.timestamp,
      }
    );
  }

  loadChatHistory(messages) {
    this.ui.clearMessages();
    messages.forEach((msg) => {
      const isMyMessage =
        msg.sender_email === this.admin.email ||
        msg.senderEmail === this.admin.email;

      if (msg.message_type === "voice" || msg.isVoice) {
        this.ui.appendVoiceMessage(
          msg.content,
          isMyMessage ? "You" : msg.sender_name || msg.senderName,
          isMyMessage,
          msg.file_name || msg.fileName,
          msg.created_at || msg.timestamp
        );
      } else {
        this.ui.appendMessage(
          msg.content,
          isMyMessage ? "You" : msg.sender_name || msg.senderName,
          isMyMessage,
          msg.created_at || msg.timestamp
        );
      }

      this.messageStore.storeMessage(
        isMyMessage
          ? msg.recipient_email || msg.recipientEmail
          : msg.sender_email || msg.senderEmail,
        { ...msg, isMyMessage }
      );
    });
  }

  handleSendMessage(e) {
    e.preventDefault();
    if (!this.selectedUser) {
      this.ui.displaySystemMessage("Please select a user first");
      return;
    }

    // Check if we're recording voice
    if (this.voiceModule.isRecording) {
      console.log("Stopping recording and sending voice message");
      this.voiceModule.stopRecording(true, this.sendVoiceMessage.bind(this));
      return;
    }

    const message = this.domElements.messageInput.value.trim();
    if (!message) return;

    const timestamp = new Date().toISOString();
    const messageData = {
      type: "admin-message",
      content: message,
      sender: this.admin.name,
      recipient: this.selectedUser.email,
      senderEmail: this.admin.email,
      timestamp,
    };

    if (this.network.send(messageData)) {
      this.messageStore.storeMessage(this.selectedUser.email, {
        ...messageData,
        isMyMessage: true,
      });

      this.domElements.messageInput.value = "";
    } else {
      this.ui.displaySystemMessage("Failed to send message");
    }
  }

  handleUserSelection(e) {
    const item = e.target.closest(".user-item");
    if (!item) return;
    this.selectedUser = {
      email: item.dataset.email,
      name: item.querySelector(".user-name").textContent,
    };
    this.ui.switchToChatView(this.selectedUser.name);
    this.network.send({
      type: "request-chat-history",
      userEmail: this.selectedUser.email,
    });
  }

  showUserList() {
    this.selectedUser = null;
    this.ui.switchToUserListView();
  }

  handleUserMessage(data) {
    const isMyMessage = data.senderEmail === this.admin.email;
    const isSenderSelected = this.selectedUser?.email === data.senderEmail;

    if (
      !isMyMessage &&
      (isSenderSelected ||
        (!this.selectedUser && data.recipient === this.admin.email))
    ) {
      this.ui.playMessageSound();
    }

    if (!isMyMessage && !isSenderSelected) {
      this.handleNewMessageFromUser(data);
    } else if (
      isSenderSelected ||
      (isMyMessage && this.selectedUser?.email === data.recipient)
    ) {
      this.ui.appendMessage(
        data.content,
        isMyMessage ? "You" : data.sender,
        isMyMessage,
        data.created_at || data.timestamp
      );
    }

    this.messageStore.storeMessage(
      isMyMessage ? data.recipient : data.senderEmail,
      {
        sender: data.sender,
        content: data.content,
        isMyMessage,
        timestamp: data.timestamp,
      }
    );
  }

  handleNewMessageFromUser(data) {
    this.selectedUser = {
      email: data.senderEmail,
      name: data.sender,
    };
    this.ui.switchToChatView(this.selectedUser.name);
    this.network.send({
      type: "request-chat-history",
      userEmail: this.selectedUser.email,
    });
  }

  addMessageToUI(messageData) {
    this.ui.appendMessage(
      messageData.content,
      "You",
      true,
      messageData.created_at || messageData.timestamp
    );
    this.messageStore.storeMessage(this.selectedUser.email, {
      ...messageData,
      isMyMessage: true,
    });
  }
}

// --- DOM elements config ---
const adminElements = {
  messageInput: document.getElementById("messageInput"),
  sendButton: document.getElementById("sendButton"),
  messagesContainer: document.getElementById("messages"),
  partnerList: document.getElementById("partnerList"),
  activeUserDisplay: document.getElementById("activeUserName"),
  chatView: document.getElementById("chatView"),
  userListView: document.getElementById("userListView"),
  backToUsers: document.getElementById("backToUsers"),
  emojiButton: document.getElementById("emojiButton"),
  emojiPicker: document.getElementById("emojiPicker"),
  voiceButton: document.getElementById("voiceButton"),
  voiceControls: document.getElementById("voiceControls"),
  deleteVoiceBtn: document.getElementById("deleteVoiceBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  voiceWave: document.getElementById("voiceWave"),
};

document.addEventListener("DOMContentLoaded", () => {
  new ChatApp(adminElements);
});