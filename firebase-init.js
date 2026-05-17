        import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
        import { getFirestore, collection, addDoc, doc, onSnapshot, updateDoc, getDoc, query, orderBy, limit, getDocs, where, deleteDoc, setDoc, runTransaction } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
        import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

        const firebaseConfig = {
            apiKey: "AIzaSyA38q4GgmYL85ukq7c-h7zI6xhHAtOPS1k",
            authDomain: "letterduel.firebaseapp.com",
            projectId: "letterduel",
            storageBucket: "letterduel.firebasestorage.app",
            messagingSenderId: "1062220635488",
            appId: "1:1062220635488:web:53e8a573fd36043b759205"
        };

        const app = initializeApp(firebaseConfig);
        window.db = getFirestore(app);
        window.auth = getAuth(app);
        
        window.firebaseFuncs = { collection, addDoc, doc, onSnapshot, updateDoc, getDoc, query, orderBy, limit, getDocs, where, deleteDoc, setDoc, runTransaction };
        
        // Globale variabele om de beurt bij te houden
        window.activeTurnPlayerId = null;

        window.currentUser = null;
        window.authReadyPromise = signInAnonymously(window.auth).then((u) => {
            console.log("Ingelogd als:", u.user.uid);
            window.currentUser = u.user;

            const urlParams = new URLSearchParams(window.location.search);
            const pendingGameId = urlParams.get('game');

            if (pendingGameId) {
                window.pendingInviteId = pendingGameId;
                if (typeof window.checkAndJoin === 'function') {
                    window.checkAndJoin();
                }
            }
            return u.user;
        }).catch(e => {
            console.error(e);
            return null;
        });
