// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDVQVLwmpArIeBuLTp08qziycWulm0iXZU",
    authDomain: "my-inventory-system-56c42.firebaseapp.com",
    projectId: "my-inventory-system-56c42",
    storageBucket: "my-inventory-system-56c42.firebasestorage.app",
    messagingSenderId: "19810246695",
    appId: "1:19810246695:web:d4b8f1c9d4d2ca2302ee02"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
