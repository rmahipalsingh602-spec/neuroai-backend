import Login from './Login.jsx'

export default function Signup({ onAuthSuccess }) {
  return <Login onAuthSuccess={onAuthSuccess} initialMode="signup" />
}
