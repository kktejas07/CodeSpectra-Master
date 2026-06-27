const admin = require('firebase-admin');
const app = admin.initializeApp({
  credential: admin.credential.cert({
    projectId: 'codespectra-f60cf',
    clientEmail: 'firebase-adminsdk-fbsvc@codespectra-f60cf.iam.gserviceaccount.com',
    privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC9A9g7VzT7wvay\nx6tbz+3ewfQ1LTeKf/O7DPxC5C/nVqyQqYH9zkZfyV1ioV1dsLZH9r0oFavJtEJ3\nXCSYV1yaWx1P7mauME97Swg4+4nulWbWp+N4XkqktgGgks/CGzK14f5qMsDRAxYr\ncdH5GSoKHeIlDRrMweV6QUOJKnMQGXS4JvfKqAJPQnfCU6h47+d6kv+NQxsITORy\ncwanUr+hBGvW33QWq6RWeEQpIfxpOBx3jBvaEX7vPoW1jVqQytKC8q8lB3etl+ZO\nzCVZ1MwiSvg/DNuqT0wi5cOFATrZ8zBxubFtV+4bgoGyj2i8Wb8N03TAoA3ivtfa\n55u8+0jHAgMBAAECggEAR9n7S+uFv6LIhwOyF0++m+xc+g37TBIBw/xWtNLrhuSC\n6ucU/Dd6txTkBAdVZ7UyRb78/wzl5eI5VghX/PVQxXiXdvgoXlUNEdBfCtJMB78R\nfc4KgYpOk7iAe9rzUVVnfI6xWQt8Erg6qD83U5sGSRw9CFqn8mhO5J+EndLeNKLh\nY6WAbCbGOXYzQeSSxmgriNsbTDxs9LSN2g0Q06rD4cCLBqST3320r5W/puSSwxxI\n73APj8IxGv2IRehHox1IvDM5zCrInfKgFgDJt28AJkiAGP7p3OOQHfbNTNVB6yGr\ndcS7U+h7iocYmxLGEpdRCZ4zKkciLMiv3bwqAUNmcQKBgQDevJmGhfA/et72tapD\nAQs4vGRhKzVvDZRcw3Ao2Wgixbws/ziWwdK62h3IcASvhiahBWke+9vZFUG5Ci8W\n6hn8bRcFOxrGMz2sx/unyNj/kDjf6tzZwvVIgaJjlvNEPxWWjiHOgvcb/5pI7fay\nX7dh1LBulN2PfBQCS3zaEX7ZiQKBgQDZPgms+WJa+Fl3spNrgBqsCkR74j8Qvfxg\nCJX5t1Bg0f0R/z+Wf/qgADUg45o3TQVrAepGnnYWqs4QCGOU3d9V689fuqErLTB0\nEknhhDF0ADr9F86a3uaLn8tprNF7lF2Emnqzxih5YLJgGhD/t30OgvSXFcbd19iQ\noEd7heyLzwKBgAyYaa4bwNw2HImi+D/VvUa2EI8WHG1tPSiJvLvyn1roB54byJ1t\n1HbQgsKk4v7x/Rk57xnbcDE0bIUEOGl5T4LgwF6BWyA+IYy1ultgljTNeQnghCCk\nT66L9hzfml4Pmy7qVqsQ6Nxidd0N59dqZjpYBqoaLPVCNPd0QVkriBrRAoGAaNjm\nNpOOArXGCF0phUKonMu/zcKeCWiIO5kpOQJeSrxOVbdJa0uNHFe9TIhMz8/eg4zD\nEx47hCkfluFVnm2O8psC1QLv8jS3I+4Htk3kyEWsMqag0mIuBskylWgRGoG6uNsN\nyWIj+qDOtk8eUSyvsKdHgPvDpSIdpX+VwGochkUCgYAeBSQfRYiyo/dbEmhuu6Fc\nU0M1Sh4uJgQIZWF/tOAEiM0iD0Uw6x6jp8Itae7d/eZPg/JswGswz8y9DG+bBGpd\nqTRMBzcSgGsqbgVG3thztu69HAFT6Y74PuM4SxidTyn53MZeFL00LIqLrELUX2Tm\nmfltVCMzgrag0XEnah4HXQ==\n-----END PRIVATE KEY-----\n'
  }),
});
const auth = admin.auth();
auth.getProviderConfig()
  .then(c => console.log(JSON.stringify(c, null, 2)))
  .catch(e => console.log('Error:', e.message))
  .finally(() => process.exit());
