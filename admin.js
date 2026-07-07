import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const loginBtn = document.getElementById("loginBtn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

loginBtn.addEventListener("click", login);

// পাসওয়ার্ড ইনপুটে Enter চাপলে লগইন হওয়ার ব্যবস্থা
passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        login();
    }
});

async function login(){
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        alert("Please enter both email and password.");
        return;
    }

    // লগইন বাটন ডিজেবল ও টেক্সট পরিবর্তন
    loginBtn.disabled = true;
    loginBtn.innerText = "Logging in...";

    try {
        await signInWithEmailAndPassword(auth, email, password);
        alert("Login Success");
        window.location.href = "dashboard.html";
    } catch (err) {
        alert(err.message);
        // ব্যর্থ হলে বাটন আবার সচল করা
        loginBtn.disabled = false;
        loginBtn.innerText = "Login";
    }
}