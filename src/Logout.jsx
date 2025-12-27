import { signOut } from "firebase/auth";
import { auth } from "./firebase";

export default function Logout() {
  const handleLogout = async () => {
    await signOut(auth);
    window.location.reload(); // simplest reset for now
  };

  return <button onClick={handleLogout}>Logout</button>;
}

