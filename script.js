document.addEventListener('DOMContentLoaded', () => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (/kakaotalk|instagram|naver|line/i.test(userAgent)) {
        alert("카카오톡 등의 앱 브라우저에서는 연결이 제한될 수 있으므로, 다른 브라우저(Chrome, Safari)로 열어주세요.");
    }

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            tabContents.forEach(c => c.classList.add('hidden-tab'));
            
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden-tab');
        });
    });

    const signalingContainer = document.getElementById('signaling-container');
    const chatContainer = document.getElementById('chat-container');
    const statusDiv = document.querySelector('.status-text');
    const statusDot = document.querySelector('.status-dot');
    const messagesDiv = document.getElementById('messages');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    const createOfferBtn = document.getElementById('create-offer-btn');
    const createAnswerBtn = document.getElementById('create-answer-btn');
    const connectBtn = document.getElementById('connect-btn');

    const offerSdpText = document.getElementById('offer-sdp');
    const answerSdpText = document.getElementById('answer-sdp');
    const receivedSdpAnswerText = document.getElementById('received-sdp-answer');
    const receivedSdpFinalText = document.getElementById('received-sdp-final');

    let peerConnection;
    let dataChannel;
    let iceGatheringTimeout;

    const iceServers = {
        iceServers:[
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' }
        ]
    };

    const logSystemMessage = (text) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message system';
        const textDiv = document.createElement('div');
        textDiv.className = 'text';
        textDiv.textContent = text;
        msgDiv.appendChild(textDiv);
        messagesDiv.appendChild(msgDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };

    const encodeSDP = (sdpObj) => btoa(encodeURIComponent(JSON.stringify(sdpObj)));
    const decodeSDP = (encodedText) => JSON.parse(decodeURIComponent(atob(encodedText.trim())));

    const setupAutoCopy = (wrapperElement) => {
        const textarea = wrapperElement.querySelector('textarea');
        const btn = wrapperElement.querySelector('.copy-btn');
        
        btn.addEventListener('click', async () => {
            if (!textarea.value) return;
            try {
                await navigator.clipboard.writeText(textarea.value);
                const span = btn.querySelector('span');
                const originalText = span.textContent;

                span.textContent = '완료';
                btn.classList.add('copied');

                setTimeout(() => {
                    span.textContent = originalText;
                    btn.classList.remove('copied');
                }, 1500);
            } catch (err) {
                alert('복사 실패');
            }
        });
    };

    document.querySelectorAll('.copy-wrapper').forEach(setupAutoCopy);

    const setupPeerConnection = (isOfferer) => {
        peerConnection = new RTCPeerConnection(iceServers);

        const finalizeCandidateGathering = () => {
            if (peerConnection.signalingState === "closed") return;
            const encodedSdp = encodeSDP(peerConnection.localDescription);
            
            if (peerConnection.localDescription.type === 'offer') {
                offerSdpText.value = encodedSdp;
                createOfferBtn.textContent = '생성 완료';
                createOfferBtn.disabled = false;
            } else if (peerConnection.localDescription.type === 'answer') {
                answerSdpText.value = encodedSdp;
                createAnswerBtn.textContent = '생성 완료';
                createAnswerBtn.disabled = false;
            }
        };

        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                clearTimeout(iceGatheringTimeout);
                iceGatheringTimeout = setTimeout(finalizeCandidateGathering, 1500);
            } else {
                clearTimeout(iceGatheringTimeout);
                finalizeCandidateGathering();
            }
        };

        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            if (state === 'connected') {
                signalingContainer.classList.add('hidden');
                chatContainer.classList.remove('hidden');
                messageInput.disabled = false;
                sendBtn.disabled = false;
                statusDiv.textContent = '연결됨';
                statusDot.style.backgroundColor = 'var(--success)';
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                statusDiv.textContent = '연결 종료';
                statusDot.style.backgroundColor = 'var(--error)';
                logSystemMessage('연결이 종료되었습니다. 새로고침 후 다시 시도하세요.');
                messageInput.disabled = true;
                sendBtn.disabled = true;
            }
        };

        peerConnection.ondatachannel = event => {
            dataChannel = event.channel;
            setupDataChannelEvents();
        };
    };

    const setupDataChannelEvents = () => {
        dataChannel.onopen = () => {};
        dataChannel.onclose = () => logSystemMessage('데이터 채널이 종료되었습니다.');
        dataChannel.onmessage = event => {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message remote';
            const textDiv = document.createElement('div');
            textDiv.className = 'text';
            textDiv.textContent = event.data;
            msgDiv.appendChild(textDiv);
            messagesDiv.appendChild(msgDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        };
    };

    createOfferBtn.onclick = async () => {
        createOfferBtn.disabled = true;
        createOfferBtn.textContent = '생성 중...';
        offerSdpText.placeholder = '로딩 중...';
        
        setupPeerConnection(true);
        dataChannel = peerConnection.createDataChannel('chat');
        setupDataChannelEvents();

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
        } catch (e) {
            alert('오류가 발생했습니다.');
            createOfferBtn.disabled = false;
            createOfferBtn.textContent = '코드 생성';
        }
    };

    createAnswerBtn.onclick = async () => {
        const receivedCode = receivedSdpAnswerText.value.trim();
        if (!receivedCode) {
            alert('코드를 입력해주세요.');
            receivedSdpAnswerText.focus();
            return;
        }

        createAnswerBtn.disabled = true;
        createAnswerBtn.textContent = '생성 중...';
        answerSdpText.placeholder = '로딩 중...';

        setupPeerConnection(false);

        try {
            const offer = decodeSDP(receivedCode);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
        } catch (e) {
            alert('코드 형식이 올바르지 않습니다.');
            createAnswerBtn.disabled = false;
            createAnswerBtn.textContent = '응답 생성';
            answerSdpText.placeholder = '';
        }
    };

    connectBtn.onclick = async () => {
        const finalCode = receivedSdpFinalText.value.trim();
        if (!finalCode) {
            alert('코드를 입력해주세요.');
            receivedSdpFinalText.focus();
            return;
        }

        connectBtn.disabled = true;
        connectBtn.textContent = '연결 중...';

        try {
            const answer = decodeSDP(finalCode);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
            alert('코드 형식이 올바르지 않습니다.');
            connectBtn.disabled = false;
            connectBtn.textContent = '연결';
        }
    };

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    messageForm.onsubmit = e => {
        e.preventDefault();
        const message = messageInput.value.trim();
        
        if (!message) return;
        if (message.length > 2000) {
            alert('최대 2000자까지 전송할 수 있습니다.');
            return;
        }

        if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(message);

            const msgDiv = document.createElement('div');
            msgDiv.className = 'message local';
            const textDiv = document.createElement('div');
            textDiv.className = 'text';
            textDiv.textContent = message;
            msgDiv.appendChild(textDiv);
            messagesDiv.appendChild(msgDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            messageInput.value = '';
            messageInput.style.height = '40px';
            messageInput.focus();
        }
    };

    messageInput.addEventListener('input', function() {
        this.style.height = '40px';
        this.style.height = (this.scrollHeight) + 'px';
    });
});