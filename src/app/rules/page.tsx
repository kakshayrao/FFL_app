import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, X, Clock, Trophy, Users, Calendar, Award, Heart, ShieldCheck } from "lucide-react"

export default function RulesPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-rfl-navy mb-2">FFL Rules & Guidelines</h1>
        <p className="text-gray-600">Clear, simple rules for a fair and fun season — PWA‑friendly on phone and desktop.</p>
      </div>

      {/* Challenge Overview */}
      <Card className="bg-white shadow-md mb-8">
        <CardHeader>
          <CardTitle className="text-xl text-rfl-navy flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            Season Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-rfl-coral mt-0.5" />
            <div>
              <strong>Oct 15, 2025 – Jan 12, 2026</strong>
              <div className="text-sm text-gray-600">90‑day team challenge to sweat, smile and win.</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Heart className="w-5 h-5 text-pink-500 mt-0.5" />
            <div>
              <strong>Fitness • Fun • Friendship</strong>
              <div className="text-sm text-gray-600">8 teams × 12–13 players each.</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Trophy className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              Fun competitions for extra points. Grand Finale & Awards — around Jan 25th.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Approved Workouts */}
      <Card className="bg-white shadow-md mb-8">
        <CardHeader>
          <CardTitle className="text-xl text-rfl-navy">Approved Workouts</CardTitle>
          <CardDescription>Simple, consistent rules for counting your effort</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <ul className="space-y-2 list-disc list-inside">
              <li><strong>Brisk Walk / Jog / Run</strong> — 4 km OR 45 mins</li>
              <li><strong>Weightlifting / Gym</strong> — 45 mins</li>
              <li><strong>Yoga / Pilates / Zumba / Dance / Swimming / Cycling / Horse Riding</strong> — 45 mins</li>
              <li><strong>Field Sports</strong> (Badminton, Pickleball, Tennis, Cricket, Basketball, etc.) — 45 mins</li>
              <li><strong>Golf</strong> — 9‑hole round</li>
              <li><strong>Steps</strong> — 10,000 steps in a day</li>
              <li><strong>65+ (Seniors)</strong>: 30 mins or 5,000 steps count. Seniors‑only extras: meditation, chanting, writing, breathing (pranayama).</li>
            </ul>
            
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle className="w-6 h-6 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm sm:text-base">
                  <strong>Combine different activities</strong> in one continuous 45‑min session (e.g., 20 min run + 25 min weights). Session must complete within 60 mins.
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
                <X className="w-6 h-6 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm sm:text-base">
                  <strong>Splitting across separate sessions</strong> (e.g., 25 min AM + 20 min PM) does not count.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workout Rules */}
      <Card className="bg-white shadow-md mb-8">
        <CardHeader>
          <CardTitle className="text-xl text-rfl-navy">Workout Session Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle className="w-6 h-6 text-green-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm sm:text-base">
              <strong>Accepted:</strong> A single continuous session of at least 45 minutes, completed within 60 minutes. 
              Different activities can be combined (e.g., 20 min run + 25 min weights) as long as they are tracked as one workout.
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
            <X className="w-6 h-6 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm sm:text-base">
              <strong>Not Accepted:</strong> Splitting time into separate sessions (e.g., 25 min in the morning + 20 min in the evening) 
              — the full 45 minutes must be done in one session.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scoring System */}
      <Card className="bg-white shadow-md mb-8">
        <CardHeader>
          <CardTitle className="text-xl text-rfl-navy">Scoring System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Clock className="w-6 h-6 text-rfl-light-blue mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base"><strong>Workout Submission:</strong> Post your approved workout with screenshot in the FFL website by 11:59pm. Your captain/VC will send them all to Governors in provided format.</span>
            </div>
            <div className="flex items-start gap-3">
              <Trophy className="w-6 h-6 text-yellow-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base"><strong>Point Earning:</strong> 1 point per member per day for completing an approved workout.</span>
            </div>
            <div className="flex items-start gap-3">
              <Trophy className="w-6 h-6 text-rfl-coral mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base"><strong>Point Cap:</strong> Each participant can earn a maximum of 1 point per day.</span>
            </div>
            <div className="flex items-start gap-3">
              <Users className="w-6 h-6 text-green-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base"><strong>Daily Workout Weightage:</strong> 90% team points from daily workouts.</span>
            </div>
            <div className="flex items-start gap-3">
              <Trophy className="w-6 h-6 text-rfl-coral mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base"><strong>Bonus Points:</strong> Earn up to 10% extra points from the Sports tournaments, and staycation fun games.</span>
            </div>
            <div className="flex items-start gap-3">
              <Trophy className="w-6 h-6 text-rfl-coral mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base"><strong>Winners:</strong> Team with the most points wins.</span>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-6 h-6 text-yellow-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base"><strong>Fair Play:</strong> "FFL FAIR PLAY" award for honesty and sportsmanship. <em>Negative points possible</em> for cheating.</span>
            </div>
            <div className="flex items-start gap-3">
              <Users className="w-6 h-6 text-rfl-light-blue mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base"><strong>Leaderboards:</strong> Team & individual leaderboards are posted regularly.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rest Days */}
      <Card className="bg-white shadow-md mb-8">
        <CardHeader>
          <CardTitle className="text-xl text-rfl-navy">Rest Days</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Calendar className="w-6 h-6 text-rfl-coral mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base">Each participant is allowed <strong>18 rest days</strong> during the challenge.</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-green-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base">To claim: log <strong>"Rest Day"</strong> in your PFL account that day (by 11:59 PM) — earns <strong>1 point</strong>.</span>
            </div>
            <div className="flex items-start gap-3">
              <Trophy className="w-6 h-6 text-yellow-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base">If not logged: <strong>0 points</strong>. No points beyond 18 rest days.</span>
            </div>
            <div className="flex items-start gap-3">
              <X className="w-6 h-6 text-red-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base">Rest days / workouts are individual and non‑transferable.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accepted Proofs */}
      <Card className="bg-white shadow-md mb-8">
        <CardHeader>
          <CardTitle className="text-xl text-rfl-navy">Accepted Proofs (Wearable Mandatory)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-500 mt-0.5 flex-shrink-0" />
            <span className="text-sm sm:text-base">Screenshot from a fitness app posted same day in your PFL account.</span>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-500 mt-0.5 flex-shrink-0" />
            <span className="text-sm sm:text-base">Screenshot must show: <strong>1) Date 2) Activity 3) Duration 4) Distance/Steps</strong> (add heart rate & calories if available or if any of these are missing).</span>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-500 mt-0.5 flex-shrink-0" />
            <span className="text-sm sm:text-base"><strong>Golf:</strong> Photo of player at course (tee/green/club sign) plus scorecard photo or golf app screenshot showing date and holes played.</span>
          </div>
          <div className="flex items-start gap-3">
            <Clock className="w-6 h-6 text-rfl-light-blue mt-0.5 flex-shrink-0" />
            <span className="text-sm sm:text-base">Keep full 90‑day history on your device for final tally.</span>
          </div>
          <div className="flex items-start gap-3">
            <Users className="w-6 h-6 text-rfl-light-blue mt-0.5 flex-shrink-0" />
            <span className="text-sm sm:text-base">Kids under 18 without watches in school: post day, activity & minutes in the Team's WhatsApp group and use that screenshot as proof.</span>
          </div>
          <div className="flex items-start gap-3">
            <X className="w-6 h-6 text-red-500 mt-0.5 flex-shrink-0" />
            <span className="text-sm sm:text-base">No dropouts expected except verified Medical Emergency (ME).</span>
          </div>
          <div className="flex items-start gap-3">
            <Heart className="w-6 h-6 text-pink-500 mt-0.5 flex-shrink-0" />
            <span className="text-sm sm:text-base"><strong>FFL Medical Emergency (ME) Rule:</strong> If a player has a verified ME (7+ days, approved by Governors), their rest days are used first. If more days are needed, other PFL players may voluntarily donate unused rest days.</span>
          </div>
        </CardContent>
      </Card>

      {/* Run Rate */}
      <Card className="bg-white shadow-md">
        <CardHeader>
          <CardTitle className="text-xl text-rfl-navy">Run Rate (RR) System</CardTitle>
          <CardDescription>Shows effort beyond minimum and acts as a tiebreaker</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Trophy className="w-6 h-6 text-yellow-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base"><strong>Purpose:</strong> RR measures workout effort above the minimum (baseline RR = 1.0) and encourages longer workouts.</span>
            </div>
            <div className="flex items-start gap-3">
              <Trophy className="w-6 h-6 text-rfl-coral mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base"><strong>Points:</strong> Still max 1 point/day — RR is for tie‑breaks and insight.</span>
            </div>
            <div className="flex items-start gap-3">
              <Trophy className="w-6 h-6 text-green-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base"><strong>Tiebreaker:</strong> Used when teams or individuals finish with equal points.</span>
            </div>
            <div className="flex items-start gap-3">
              <Trophy className="w-6 h-6 text-rfl-coral mt-0.5 flex-shrink-0" />
              <span className="text-sm sm:text-base"><strong>Effort vs. Points:</strong> More effort = higher RR ... but remember, get your point first!</span>
            </div>
          </div>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-semibold text-rfl-navy mb-3">RR Examples:</h4>
            <div className="space-y-2 text-sm">
              <div><strong>Workout Duration:</strong> 45 mins = RR 1.0 | 60 mins = RR 1.33</div>
              <div><strong>Steps:</strong> 10,000 steps = RR 1.0 | 18,000 steps = RR 1.8</div>
              <div><strong>Golf:</strong> 9 holes = RR 1.0 | 18 holes = RR 2.0</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grand Finale & Awards */}
      <Card className="bg-white shadow-md mt-8">
        <CardHeader>
          <CardTitle className="text-xl text-rfl-navy flex items-center gap-2"><Award className="w-5 h-5 text-yellow-500" /> Grand Finale & Awards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <Trophy className="w-6 h-6 text-rfl-coral mt-0.5 flex-shrink-0" />
            <span className="text-sm sm:text-base">On‑site games & challenges for extra points + Awards around <strong>Jan 24–25</strong>.</span>
          </div>
          <div className="flex items-start gap-3">
            <Trophy className="w-6 h-6 text-green-600 mt-0.5 flex-shrink-0" />
            <span className="text-sm sm:text-base"><strong>Prizes:</strong> Winner ₹25,000 • Runner ₹15,000 • Third ₹10,000 • FFL FAIR PLAY award + team/individual prizes.</span>
          </div>
        </CardContent>
      </Card>

      {/* Play Fair */}
      <Card className="bg-white shadow-md mt-8">
        <CardHeader>
          <CardTitle className="text-xl text-rfl-navy">Play Fair & Have Fun</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>• This is a friendly fitness initiative to promote bonding, health & fun.</div>
          <div>• No cheating, tampering, or misuse of devices.</div>
          <div>• Board of Governors’ decisions are final — no appeals, discussions or displeasure.</div>
          <div>• Let’s cheer loud, lift each other up, and crush this challenge together!</div>
        </CardContent>
      </Card>
    </div>
  )
}
