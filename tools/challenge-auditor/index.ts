import { access, readdir } from 'fs/promises';
import { join, resolve } from 'path';

import { flatten } from 'lodash/fp';
import { config } from 'dotenv';

const envPath = resolve(__dirname, '../../.env');
config({ path: envPath });

import { availableLangs } from '../../shared/config/i18n';
import { getChallengesForLang } from '../../curriculum/get-challenges';
import {
  SuperBlocks,
  getAuditedSuperBlocks,
  superBlockToFolderMap
} from '../../shared/config/curriculum';

// TODO: re-organise the types to a common 'types' folder that can be shared
// between the workspaces so we don't have to declare ChallengeNode here and in
// the client.

// This cannot be imported from the client, without causing tsc to attempt to
// compile the client (something it cannot do)
type ChallengeNode = {
  block: string;
  dashedName: string;
  superBlock: SuperBlocks;
  id: string;
  challengeType: number;
};

// Adding types for getChallengesForLang is possible, but not worth the effort
// at this time.
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

const getChallenges = async (lang: string) => {
  const curriculum = await getChallengesForLang(lang);
  return Object.keys(curriculum)
    .map(key => curriculum[key].blocks)
    .reduce((challengeArray, superBlock) => {
      const challengesForBlock = Object.keys(superBlock).map(
        key => superBlock[key].challenges
      );
      return [...challengeArray, ...flatten(challengesForBlock)];
    }, []) as unknown as ChallengeNode[];
};

/* eslint-enable @typescript-eslint/no-unsafe-return */
/* eslint-enable @typescript-eslint/no-unsafe-argument */
/* eslint-enable @typescript-eslint/no-unsafe-assignment */
/* eslint-enable @typescript-eslint/no-unsafe-member-access */

void (async () => {
  let actionShouldFail = false;
  const englishCurriculumDirectory = join(
    process.cwd(),
    'curriculum',
    'challenges',
    'english'
  );
  const englishFilePaths: string[] = [];
  const englishSuperblocks = await readdir(englishCurriculumDirectory);
  for (const englishSuperblock of englishSuperblocks) {
    const englishBlocks = await readdir(
      join(englishCurriculumDirectory, englishSuperblock)
    );
    for (const englishBlock of englishBlocks) {
      if (englishBlock.endsWith('.txt')) {
        continue;
      }
      const englishChallenges = await readdir(
        join(englishCurriculumDirectory, englishSuperblock, englishBlock)
      );
      for (const englishChallenge of englishChallenges) {
        englishFilePaths.push(
          join(englishSuperblock, englishBlock, englishChallenge)
        );
      }
    }
  }
  const langsToCheck = availableLangs.curriculum.filter(
    lang => String(lang) !== 'english'
  );
  for (const language of langsToCheck) {
    console.log(`\n=== ${language} ===`);
    const certs = getAuditedSuperBlocks({ language });
    const langCurriculumDirectory = join(
      process.cwd(),
      'curriculum',
      'i18n-curriculum',
      'curriculum',
      'challenges',
      language
    );
    const auditedFiles = englishFilePaths.filter(file =>
      certs.some(
        cert =>
          // we're not ready to audit the new curriculum yet
          (cert !== SuperBlocks.JsAlgoDataStructNew ||
            process.env.SHOW_UPCOMING_CHANGES === 'true') &&
          file.startsWith(superBlockToFolderMap[cert])
      )
    );
    const noMissingFiles = await auditChallengeFiles(auditedFiles, {
      langCurriculumDirectory
    });
    const noDuplicateSlugs = await auditSlugs(language, certs);
    if (noMissingFiles && noDuplicateSlugs) {
      console.log(`All challenges pass.`);
    } else {
      actionShouldFail = true;
    }
  }
  process.exit(actionShouldFail ? 1 : 0);
})();

async function auditChallengeFiles(
  auditedFiles: string[],
  { langCurriculumDirectory }: { langCurriculumDirectory: string }
) {
  let auditPassed = true;
  for (const file of auditedFiles) {
    const filePath = join(langCurriculumDirectory, file);
    const fileExists = await access(filePath)
      .then(() => true)
      .catch(() => false);
    if (!fileExists) {
      console.log(`${filePath} does not exist.`);
      auditPassed = false;
    }
  }
  return auditPassed;
}

async function auditSlugs(lang: string, certs: SuperBlocks[]) {
  let auditPassed = true;
  const slugs = new Map<string, string>();
  const challenges = await getChallenges(lang);

  for (const challenge of challenges) {
    const { block, dashedName, superBlock } = challenge;
    const slug = `/learn/${superBlock}/${block}/${dashedName}`;
    // Skipping certifications
    const isCertification = challenge.challengeType === 7;
    if (certs.includes(superBlock) && !isCertification && slugs.has(slug)) {
      console.log(
        `${slug} appears more than once: ${slugs.get(slug) ?? ''} and ${
          challenge.id
        }`
      );
      auditPassed = false;
    }
    slugs.set(slug, challenge.id);
  }

  return auditPassed;
}
