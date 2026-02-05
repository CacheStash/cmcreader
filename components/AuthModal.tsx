import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { Button } from './Button';
import { FiX } from 'react-icons/fi';

interface AuthModalProps {
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Cek email kamu untuk konfirmasi pendaftaran!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose(); // Tutup modal jika sukses login
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 p-6 rounded-xl w-full max-w-sm relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><FiX /></button>
        
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          {isSignUp ? 'Buat Akun Baru' : 'Login ZenReader'}
        </h2>

        {error && <div className="bg-red-500/20 text-red-200 p-3 rounded mb-4 text-sm">{error}</div>}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input 
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input 
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
            />
          </div>
          
          <Button type="submit" disabled={loading} className="w-full justify-center">
            {loading ? 'Processing...' : (isSignUp ? 'Daftar' : 'Masuk')}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-400">
          {isSignUp ? 'Sudah punya akun?' : 'Belum punya akun?'}
          <button onClick={() => setIsSignUp(!isSignUp)} className="text-blue-400 ml-1 hover:underline">
            {isSignUp ? 'Login' : 'Daftar'}
          </button>
        </p>
      </div>
    </div>
  );
};