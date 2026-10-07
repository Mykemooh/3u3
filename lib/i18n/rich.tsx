import { Fragment } from 'react';

/**
 * A translated sentence with markup inside it: rich(t('tapArrived'), { button: <b>{t('arrived')}</b> }).
 * The {placeholders} can sit anywhere in either language's sentence, so
 * Spanish word order never has to bend around English fragments.
 */
export function rich(template: string, parts: Record<string, React.ReactNode>): React.ReactNode[] {
  return template.split(/(\{\w+\})/).map((piece, i) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    return name && name in parts ? <Fragment key={i}>{parts[name]}</Fragment> : piece;
  });
}
