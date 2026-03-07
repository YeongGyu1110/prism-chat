document.addEventListener('DOMContentLoaded', () => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (/kakaotalk|instagram|naver|line/i.test(userAgent)) {
        alert("⚠️ 카카오톡 등 내장 브라우저에서는 기능이 제한될 수 있습니다.\n우측 상단 메뉴를 눌러 '다른 브라우저(Chrome, Safari)로 열기'를 선택해주세요.");
    }

    const signalingContainer = document.getElementById('signaling-container');
    const chatContainer = document.getElementById('chat-container');
    const statusDiv = document.getElementById('status');
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
        msgDiv.textContent = text;
        messagesDiv.appendChild(msgDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };

    const encodeSDP = (sdpObj) => btoa(encodeURIComponent(JSON.stringify(sdpObj)));
    const decodeSDP = (encodedText) => JSON.parse(decodeURIComponent(atob(encodedText.trim())));

    const setupAutoCopy = (element, name) => {
        element.addEventListener('click', async () => {
            if (!element.value) return;
            try {
                await navigator.clipboard.writeText(element.value);
                alert(`✅ [${name}]가 클립보드에 복사되었습니다!\n친구에게 붙여넣기 해주세요.`);
            } catch (err) {
                alert('복사 실패! 직접 텍스트를 선택해서 복사해주세요.');
            }
        });
        element.style.cursor = 'pointer';
        element.title = '클릭하면 복사됩니다.';
    };

    setupAutoCopy(offerSdpText, '연결 코드');
    setupAutoCopy(answerSdpText, '응답 코드');

    const setupPeerConnection = (isOfferer) => {
        peerConnection = new RTCPeerConnection(iceServers);

        const finalizeCandidateGathering = () => {
            if (peerConnection.signalingState === "closed") return;
            const encodedSdp = encodeSDP(peerConnection.localDescription);
            
            if (peerConnection.localDescription.type === 'offer') {
                offerSdpText.value = encodedSdp;
                createOfferBtn.textContent = '✅ 연결 코드 생성 완료 (클릭해서 복사)';
                createOfferBtn.disabled = false;
            } else if (peerConnection.localDescription.type === 'answer') {
                answerSdpText.value = encodedSdp;
                createAnswerBtn.textContent = '✅ 응답 코드 생성 완료 (클릭해서 복사)';
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
            statusDiv.textContent = `상태: ${state}`;
            if (state === 'connected') {
                signalingContainer.classList.add('hidden');
                chatContainer.classList.remove('hidden');
                chatContainer.style.display = 'flex';
                messageInput.disabled = false;
                sendBtn.disabled = false;
                logSystemMessage('✅ P2P 연결 성공! 안전한 대화를 시작하세요.');
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                statusDiv.style.color = '#ff7675';
                logSystemMessage('❌ 연결이 끊어졌습니다. 새로고침하여 다시 연결해주세요.');
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
        dataChannel.onclose = () => logSystemMessage('데이터 채널 종료됨');
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
        createOfferBtn.textContent = '⏳ 코드 생성 중... (최대 3초 대기)';
        offerSdpText.placeholder = '로딩 중...';
        
        setupPeerConnection(true);
        dataChannel = peerConnection.createDataChannel('chat');
        setupDataChannelEvents();

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
        } catch (e) {
            alert(`오류: ${e}`);
            createOfferBtn.disabled = false;
            createOfferBtn.textContent = '1. 연결 코드 생성';
        }
    };

    createAnswerBtn.onclick = async () => {
        const receivedCode = receivedSdpAnswerText.value.trim();
        if (!receivedCode) {
            alert('친구에게 받은 연결 코드를 입력해주세요.');
            receivedSdpAnswerText.focus();
            return;
        }

        createAnswerBtn.disabled = true;
        createAnswerBtn.textContent = '⏳ 응답 코드 생성 중...';
        answerSdpText.placeholder = '로딩 중...';

        setupPeerConnection(false);

        try {
            const offer = decodeSDP(receivedCode);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
        } catch (e) {
            alert(`❌ 코드 형식이 잘못되었습니다. 공백 없이 정확히 복사했는지 확인해주세요.`);
            createAnswerBtn.disabled = false;
            createAnswerBtn.textContent = '2. 응답 코드 생성';
            answerSdpText.placeholder = '[응답 코드 대기중...]';
        }
    };

    connectBtn.onclick = async () => {
        const finalCode = receivedSdpFinalText.value.trim();
        if (!finalCode) {
            alert('친구에게 받은 응답 코드를 입력해주세요.');
            receivedSdpFinalText.focus();
            return;
        }

        connectBtn.disabled = true;
        connectBtn.textContent = '⏳ 연결 중...';

        try {
            const answer = decodeSDP(finalCode);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
            alert(`❌ 코드 형식이 잘못되었습니다. 정확히 복사했는지 확인해주세요.`);
            connectBtn.disabled = false;
            connectBtn.textContent = '3. 연결 시작 🚀';
        }
    };

    messageForm.onsubmit = e => {
        e.preventDefault();
        const message = messageInput.value.trim();
        
        if (!message) return;
        if (message.length > 2000) {
            alert('⚠️ 한 번에 전송할 수 있는 글자 수는 최대 2000자입니다.');
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
            messageInput.focus();
        }
    };
});