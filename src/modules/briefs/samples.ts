import type { TargetKeyword } from './types';

/**
 * Sample targets for the fictional Sample Outdoors shop (sample-outdoors.example). Volumes are made-up sample
 * figures, labelled as such in the UI. Positions and ranking pages come from the site's own Search Console data.
 */
const k = (keyword: string, volume: number): TargetKeyword => ({ keyword, volume, position: null, path: null });

export const SAMPLE_TARGETS: { primary: string; keywords: TargetKeyword[]; relevance: number }[] = [
  { primary: 'via ferrata for beginners', relevance: 4, keywords: [k('via ferrata for beginners', 880), k('what is a via ferrata', 1300), k('is via ferrata safe', 390), k('via ferrata uk', 720), k('via ferrata kit list', 170), k('do i need a guide for via ferrata', 90)] },
  { primary: 'best walking poles uk', relevance: 5, keywords: [k('best walking poles uk', 1600), k('best walking poles', 2900), k('walking poles review', 480), k('carbon vs aluminium walking poles', 210), k('how to use walking poles', 720)] },
  { primary: 'how to choose a sleeping bag', relevance: 5, keywords: [k('how to choose a sleeping bag', 1000), k('sleeping bag temperature ratings explained', 320), k('down vs synthetic sleeping bag', 590), k('sleeping bag for beginners', 110), k('what sleeping bag do i need for uk camping', 260)] },
  { primary: 'cheap hiking boots', relevance: 2, keywords: [k('cheap hiking boots', 2400), k('hiking boots sale', 1900), k('budget hiking boots uk', 390)] },
  { primary: 'wild camping uk', relevance: 4, keywords: [k('wild camping uk', 4400), k('is wild camping legal in the uk', 2900), k('wild camping scotland', 1600), k('wild camping checklist', 320), k('wild camping for beginners', 480)] },
  { primary: 'how to use a compass', relevance: 3, keywords: [k('how to use a compass', 3600), k('how to take a bearing', 590), k('compass vs gps', 140), k('map reading for beginners', 880)] },
  { primary: 'head torch lumens', relevance: 3, keywords: [k('head torch lumens', 70), k('how many lumens for a head torch', 40)] },
  { primary: 'outdoor gear brand history', relevance: 1, keywords: [k('outdoor gear brand history', 30)] },
];
