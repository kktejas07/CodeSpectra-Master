import { MongoClient } from 'mongodb'

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URI_FALLBACK || 'mongodb://localhost:27017/codespectra'
  console.log('Connecting to MongoDB:', uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'))
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db()
    const teamsCol = db.collection('hackathon_teams')
    const usersCol = db.collection('users')

    console.log('--- Step 1: Scanning Teams for Teja / PARADISE / Snehith / Maneesh ---')
    const teams = await teamsCol.find({}).toArray()
    console.log(`Total teams in database: ${teams.length}`)

    // 1. Locate Teja's team
    let paradiseTeam = teams.find(t =>
      t.name.toLowerCase().includes('paradise') ||
      t.name.toLowerCase().includes('teja') ||
      t.members.some((m: any) => m.name.toLowerCase().includes('teja') || m.user_id.toLowerCase().includes('24311a05b5'))
    )

    if (paradiseTeam) {
      console.log(`Found target team [ID: ${paradiseTeam.id}, Current Name: "${paradiseTeam.name}"]`)
      // Rename team to PARADISE
      await teamsCol.updateOne({ id: paradiseTeam.id }, { $set: { name: 'PARADISE', updated_at: new Date().toISOString() } })
      console.log('Renamed team to "PARADISE"')
    } else {
      console.log('No team found for Teja/PARADISE. Finding Teja user...')
      const tejaUser = await usersCol.findOne({
        $or: [
          { name: /Teja|24311a05b5/i },
          { email: /Teja|24311a05b5/i }
        ]
      })
      const tejaId = tejaUser ? tejaUser.id || tejaUser._id.toString() : '24311a05b5'
      const tejaName = tejaUser ? tejaUser.name || '24311a05b5 (B) Teja' : '24311a05b5 (B) Teja'

      // Create PARADISE team
      const newTeam = {
        id: require('crypto').randomUUID(),
        hackathon_id: teams[0]?.hackathon_id || 'default-hackathon',
        name: 'PARADISE',
        slug: 'paradise',
        qr_token: require('crypto').randomBytes(18).toString('hex'),
        members: [{ user_id: tejaId, name: tejaName, role: 'captain' }],
        xp: 0,
        level: 1,
        achievements: [],
        submissions: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      await teamsCol.insertOne(newTeam as any)
      paradiseTeam = newTeam as any
      console.log('Created new team "PARADISE"')
    }

    // 2. Find Maneesh and Snehith users / identifiers
    const maneeshUser = await usersCol.findOne({
      $or: [{ name: /Maneesh|24311a0573/i }, { email: /Maneesh|24311a0573/i }]
    })
    const snehithUser = await usersCol.findOne({
      $or: [{ name: /Snehith|24311a0583/i }, { email: /Snehith|24311a0583/i }]
    })

    const maneeshId = maneeshUser ? (maneeshUser.id || maneeshUser._id.toString()) : '24311a0573'
    const maneeshName = maneeshUser ? (maneeshUser.name || '24311a0573 (B) Maneesh') : '24311a0573 (B) Maneesh'

    const snehithId = snehithUser ? (snehithUser.id || snehithUser._id.toString()) : '24311a0583'
    const snehithName = snehithUser ? (snehithUser.name || '24311a0583 (B) Snehith') : '24311a0583 (B) Snehith'

    console.log('User identifiers resolved:', {
      teja: paradiseTeam.members.find((m: any) => m.role === 'captain'),
      maneesh: { id: maneeshId, name: maneeshName },
      snehith: { id: snehithId, name: snehithName }
    })

    // 3. Remove Maneesh & Snehith from any other solo/dummy teams
    const soloTeamsToRemove = await teamsCol.find({
      id: { $ne: paradiseTeam.id },
      $or: [
        { 'members.user_id': maneeshId },
        { 'members.user_id': snehithId },
        { 'members.name': /Maneesh|Snehith|24311a0573|24311a0583/i }
      ]
    }).toArray()

    for (const t of soloTeamsToRemove) {
      if (t.members.length === 1 && (t.submissions || 0) === 0) {
        console.log(`Dissolving empty solo team "${t.name}" [ID: ${t.id}]`)
        await teamsCol.deleteOne({ id: t.id })
      } else {
        console.log(`Removing member from existing team "${t.name}" [ID: ${t.id}]`)
        await teamsCol.updateOne(
          { id: t.id },
          { $pull: { members: { $or: [{ user_id: maneeshId }, { user_id: snehithId }] } } as any }
        )
      }
    }

    // 4. Update PARADISE team members list
    const currentMembers = paradiseTeam.members || []
    const updatedMembers = [...currentMembers]

    // Ensure Captain is Teja
    if (!updatedMembers.some((m: any) => m.role === 'captain')) {
      updatedMembers[0].role = 'captain'
    }

    // Add Maneesh if not present
    if (!updatedMembers.some((m: any) => m.user_id === maneeshId || m.name.includes('Maneesh') || m.name.includes('24311a0573'))) {
      updatedMembers.push({ user_id: maneeshId, name: maneeshName, role: 'member' })
    }

    // Add Snehith if not present
    if (!updatedMembers.some((m: any) => m.user_id === snehithId || m.name.includes('Snehith') || m.name.includes('24311a0583'))) {
      updatedMembers.push({ user_id: snehithId, name: snehithName, role: 'member' })
    }

    await teamsCol.updateOne(
      { id: paradiseTeam.id },
      { $set: { members: updatedMembers, name: 'PARADISE', updated_at: new Date().toISOString() } }
    )

    console.log('--- Step 2: Global Database Audit for All Orphaned/Solo Duplicate Teams ---')
    const allTeamsAfter = await teamsCol.find({}).toArray()
    const userTeamMap = new Map<string, string[]>()

    for (const t of allTeamsAfter) {
      for (const m of t.members) {
        if (!userTeamMap.has(m.user_id)) userTeamMap.set(m.user_id, [])
        userTeamMap.get(m.user_id)!.push(t.id)
      }
    }

    let cleanedCount = 0
    for (const [uid, teamIds] of userTeamMap.entries()) {
      if (teamIds.length > 1) {
        console.log(`User ${uid} belongs to ${teamIds.length} teams. Cleaning up empty solo teams...`)
        for (const tid of teamIds) {
          const tDoc = allTeamsAfter.find(t => t.id === tid)
          if (tDoc && tDoc.members.length === 1 && (tDoc.submissions || 0) === 0) {
            console.log(`  Deleting duplicate empty solo team "${tDoc.name}" [ID: ${tid}]`)
            await teamsCol.deleteOne({ id: tid })
            cleanedCount++
          }
        }
      }
    }

    console.log(`Global audit completed. Cleaned up ${cleanedCount} duplicate solo teams.`)

    // Print final team PARADISE details
    const finalParadise = await teamsCol.findOne({ id: paradiseTeam.id })
    console.log('--- FINAL TEAM PARADISE ROSTER ---')
    console.log(JSON.stringify(finalParadise, null, 2))
    console.log('SUCCESS: Fix completed!')

  } catch (e) {
    console.error('Error during execution:', e)
  } finally {
    await client.close()
  }
}

run()
