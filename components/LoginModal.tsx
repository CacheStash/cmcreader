import React, { useState } from 'react';
import { FiLock, FiUser, FiEye, FiEyeOff, FiLoader, FiShield } from 'react-icons/fi';
import { authApi } from '../services/webApi';

interface LoginModalProps {
  onSuccess: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Harap masukkan username dan password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await authApi.login(username.trim(), password);
      if (res.success) {
        onSuccess();
      } else {
        setError(res.error || 'Username atau password salah.');
      }
    } catch {
      setError('Gagal menghubungi server. Periksa koneksi Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 selection:bg-indigo-500/30">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800/80 rounded-3xl p-8 shadow-2xl shadow-black/80 flex flex-col items-center animate-fadeIn">
        {/* Logo / Badge */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 mb-4">
          <FiShield className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-white tracking-wide text-center">ZenReader Access</h1>
        <p className="text-xs text-zinc-400 mt-1 mb-6 text-center">
          Masukkan username dan password untuk membuka koleksi komik Anda.
        </p>

        {error && (
          <div className="w-full mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          {/* Username Input */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-zinc-500">
              <FiUser className="w-4 h-4" />
            </span>
            <input
              type="text"
              autoFocus
              autoComplete="username"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-zinc-800/80 border border-zinc-700/60 rounded-xl text-white text-sm placeholder-zinc-500 focus:border-indigo-500 focus:bg-zinc-800 outline-none transition-all"
            />
          </div>

          {/* Password Input */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-zinc-500">
              <FiLock className="w-4 h-4" />
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-11 py-3 bg-zinc-800/80 border border-zinc-700/60 rounded-xl text-white text-sm placeholder-zinc-500 focus:border-indigo-500 focus:bg-zinc-800 outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-400 hover:text-white transition-colors"
            >
              {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            className="w-full mt-2 py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 active:scale-95"
          >
            {loading ? (
              <>
                <FiLoader className="w-4 h-4 animate-spin" />
                <span>Memverifikasi...</span>
              </>
            ) : (
              <span>Masuk</span>
            )}
          </button>
        </form>

        <p className="text-[11px] text-zinc-500 mt-6 text-center">
          Cloudflare Tunnel Protected • Zero-Third-Party Security
        </p>
      </div>
    </div>
  );
};
