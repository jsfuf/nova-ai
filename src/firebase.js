import { initializeApp } from "firebase/app"
import { getAuth, GoogleAuthProvider } from "firebase/auth"
import { getDatabase } from "firebase/database"

const firebaseConfig = {
  apiKey: "AIzaSyBBj5Mu_CxnFfZtv0-b5k9EjrHr_-CvMeI",
  authDomain: "nexa-ao.firebaseapp.com",
  projectId: "nexa-ao",
  storageBucket: "nexa-ao.firebasestorage.app",
  messagingSenderId: "714348000442",
  appId: "1:714348000442:web:1436e6dcfb32376303fe83",
  measurementId: "G-YNDCCNX8VX",
  databaseURL: "https://nexa-ao-default-rtdb.firebaseio.com"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const rtdb = getDatabase(app)
export const googleProvider = new GoogleAuthProvider()
