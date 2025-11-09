"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { signIn } from "next-auth/react";

interface Team {
  id: string;
  name: string;
}

export default function SignUpPage() {
  const router = useRouter();
  // Profile info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // Auth credentials
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"player" | "leader">("player");
  const [teamId, setTeamId] = useState<string>("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch teams from Supabase
    const fetchTeams = async () => {
      const { data, error } = await getSupabase()
        .from("teams")
        .select("id, name")
        .order("name");
      
      if (error) {
        console.error("Error fetching teams:", error);
        // Fallback to hardcoded teams if DB query fails
        setTeams([
          { id: "gymntonic", name: "Gym n Tonic" },
          { id: "musclemania", name: "Muscle Mania" },
          { id: "absolutes", name: "The ABS-OLUTES" },
          { id: "missionfit", name: "Mission Fitpossible" },
          { id: "corecrusher", name: "Core Crusher" },
        ]);
      } else {
        setTeams(data || []);
      }
    };

    fetchTeams();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || !password || !firstName || !email) {
      setError("Please fill in all required fields (Username, Password, First name, Email).");
      return;
    }

    // Normalize username to lowercase and ensure uniqueness
    const normalizedUsername = username.trim().toLowerCase();
    const { data: existing } = await getSupabase()
      .from("accounts")
      .select("id")
      .eq("username", normalizedUsername)
      .maybeSingle();
    if (existing) {
      setError("That username is already taken.");
      return;
    }

    const { error: insertError } = await getSupabase()
      .from("accounts")
      .insert({
        first_name: firstName,
        last_name: lastName,
        username: normalizedUsername,
        password: password, // Plaintext password as requested
        role,
        team_id: teamId || null,
        age: age ? parseInt(age) : null,
        gender: gender || null,
        email: email || null,
        phone: phone || null,
      });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    // Auto sign-in after sign-up with new credentials
    const res = await signIn("credentials", {
      username: normalizedUsername,
      password,
      redirect: false,
      callbackUrl: "/dashboard",
    });
    if (res?.ok) router.push("/dashboard");
  };

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-rfl-navy mb-4">Create your account</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Credentials */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} className="w-full border rounded-md px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border rounded-md px-3 py-2" required />
          </div>
          {/* Profile information */}
          <div>
            <label className="block text-sm font-medium text-gray-700">First name</label>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full border rounded-md px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Last name</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} className="w-full border rounded-md px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Age</label>
            <input 
              type="number" 
              value={age} 
              onChange={e => setAge(e.target.value)} 
              className="w-full border rounded-md px-3 py-2" 
              min="1" 
              max="120"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Gender</label>
            <select value={gender} onChange={e => setGender(e.target.value)} className="w-full border rounded-md px-3 py-2">
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer-not-to-say">Prefer not to say</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email <span className="text-red-500">*</span></label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full border rounded-md px-3 py-2" 
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Phone number</label>
            <input 
              type="tel" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              className="w-full border rounded-md px-3 py-2" 
              placeholder="e.g., +1 (555) 123-4567"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="role" checked={role==='player'} onChange={() => setRole('player')} />
                <span>Team Member</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="role" checked={role==='leader'} onChange={() => setRole('leader')} />
                <span>Team Leader</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
            <select value={teamId} onChange={e => setTeamId(e.target.value)} className="w-full border rounded-md px-3 py-2">
              <option value="">Select a team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">You can change this later if needed.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="w-full bg-rfl-coral text-white rounded-md py-2">Create account</button>
        </form>
        <p className="mt-4 text-sm text-center">
          Already have an account? <a href="/signin" className="text-rfl-navy font-medium">Log in</a>
        </p>
      </div>
    </div>
  );
}


