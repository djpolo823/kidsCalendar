
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qzmhkyazrnowicrjkcvc.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6bWhreWF6cm5vd2ljcmprY3ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0Mzg5NDUsImV4cCI6MjA4NTAxNDk0NX0.If-80mMqY1cwPFZDRtrIEdLMaCMRvdO4tx-At-LPeLw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testRegistration() {
    const testEmail = `test_${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';
    const testName = 'Test Agent User';

    console.log(`Attempting to sign up: ${testEmail}`);

    try {
        const { data, error } = await supabase.auth.signUp({
            email: testEmail,
            password: testPassword,
            options: {
                data: {
                    full_name: testName,
                    avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${testName}`
                }
            }
        });

        if (error) {
            console.error('Registration failed:', error.message);
            process.exit(1);
        }

        console.log('Registration request successful!');
        console.log('User ID:', data.user?.id);
        console.log('User Email:', data.user?.email);

        // Check profiles
        console.log('Checking for profile in 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        const { data: profile, error: pError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user?.id)
            .single();

        if (profile) {
            console.log('Profile found! Name:', profile.full_name);
        } else {
            console.log('Profile not found (This is expected as the application logic creates it upon session start).');
            if (pError) console.log('Profile fetch result:', pError.message);
        }

        console.log('TEST COMPLETE');
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

testRegistration();
