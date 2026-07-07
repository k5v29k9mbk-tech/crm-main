import {
  Box,
  Typography,
  Stack,
  Container,
  Avatar,
  Skeleton,
  Paper,
  useTheme,
  LinearProgress,
  CircularProgress,
  Chip,
  Tooltip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import RemoveIcon from '@mui/icons-material/Remove';
import { useQuery } from '@tanstack/react-query';
import {
  getPremiumLeaderboard,
  getLeaderboardPeriodWinners,
} from '../utils/query';
import { useAgent } from '../hooks/useAgent';
import DateSelector from '../components/DateSelector';
import { stringToColor } from '../utils/helpers';
import {
  getTierProgress,
  earnedBadges,
  rankByXp,
  WEEKLY_LEAD_GOAL,
  leadsToNextTier,
  LEAD_XP,
  SALE_XP,
} from '../utils/gamification';
import dayjs from 'dayjs';
import { useState, useMemo } from 'react';

const TOP_LIST_LIMIT = 10;
const GOLD = '#D4AF37';

const MEDALS = {
  0: { main: '#D4AF37', dark: '#A8841E' },
  1: { main: '#B4BAC2', dark: '#8A9099' },
  2: { main: '#CD7F32', dark: '#9C5E22' },
};

const getInitials = (name) =>
  (name || '')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const formatMoney = (value) =>
  `$${Math.round(Number(value) || 0).toLocaleString()}`;
const formatNum = (value) => Math.round(Number(value) || 0).toLocaleString();

const Leaderboard = () => {
  const theme = useTheme();
  const agent = useAgent();
  const [startDate, setStartDate] = useState(
    dayjs().add(-7, 'day').format('YYYY-MM-DD'),
  );
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));

  const {
    data: rows = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['premiumLeaderboard', startDate, endDate, agent?.org_id],
    queryFn: () =>
      getPremiumLeaderboard({ agency: agent?.org_id, startDate, endDate }),
    enabled: !!agent?.org_id,
  });

  const { data: periodWinners, isLoading: isPeriodLoading } = useQuery({
    queryKey: ['leaderboardPeriodWinners', agent?.org_id],
    queryFn: () => getLeaderboardPeriodWinners({ agency: agent?.org_id }),
    enabled: !!agent?.org_id,
  });

  const handleStartChange = (val) =>
    setStartDate(
      val && dayjs(val).isValid() ? dayjs(val).format('YYYY-MM-DD') : '',
    );
  const handleEndChange = (val) =>
    setEndDate(val && dayjs(val).isValid() ? dayjs(val).format('YYYY-MM-DD') : '');

  // Rank everyone by XP (lead-weighted), then slice for the podium / list.
  const ranked = useMemo(() => rankByXp(rows), [rows]);
  const topRows = ranked.slice(0, TOP_LIST_LIMIT);
  const podium = topRows.slice(0, 3);
  const rest = topRows.slice(3);

  const meIndex = useMemo(
    () =>
      ranked.findIndex(
        (r) => r.isCurrentUser || (agent?.name && r.name === agent.name),
      ),
    [ranked, agent],
  );
  const me = meIndex >= 0 ? ranked[meIndex] : null;
  const personAbove = meIndex > 0 ? ranked[meIndex - 1] : null;

  return (
    <Container sx={{ mt: 4, mb: 8 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent='space-between'
        alignItems={{ sm: 'flex-start' }}
        spacing={2}
        mb={3}
      >
        <Box>
          <Typography variant='h4'>Leaderboard</Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
            Earn <b>{LEAD_XP} XP</b> per lead and <b>{SALE_XP} XP</b> per sale.
            Keep your streak alive to climb the ranks.
          </Typography>
        </Box>
        <DateSelector
          startDate={startDate}
          endDate={endDate}
          handleStartChange={handleStartChange}
          handleEndChange={handleEndChange}
          refetchFunction={refetch}
          isLoading={isLoading}
        />
      </Stack>

      {/* Personal progress hero — the main incentive driver. */}
      {me && (
        <Box sx={{ maxWidth: 900, mx: 'auto', mb: { xs: 3, sm: 4 } }}>
          <YourProgressCard row={me} rank={meIndex} above={personAbove} />
        </Box>
      )}

      {/* Period champions */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ maxWidth: 900, mx: 'auto', mb: { xs: 4, sm: 6 } }}
      >
        <PeriodWinnerCard
          eyebrow="Last Month's Champion"
          period={periodWinners?.lastMonth}
          loading={isPeriodLoading}
        />
        <PeriodWinnerCard
          eyebrow="Last Week's Champion"
          period={periodWinners?.lastWeek}
          loading={isPeriodLoading}
        />
      </Stack>

      {isLoading ? (
        <Stack spacing={2} sx={{ maxWidth: 900, mx: 'auto' }}>
          <Skeleton variant='rounded' height={220} />
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} variant='rounded' height={72} />
          ))}
        </Stack>
      ) : topRows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <EmojiEventsIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
          <Typography>No activity recorded for this period yet.</Typography>
        </Box>
      ) : (
        <Box sx={{ maxWidth: 900, mx: 'auto' }}>
          {podium.length > 0 && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: { xs: 'stretch', sm: 'flex-end' },
                gap: { xs: 2, sm: 2.5 },
                flexDirection: { xs: 'column', sm: 'row' },
                mb: rest.length ? 4 : 0,
              }}
            >
              {[podium[1], podium[0], podium[2]].map((row) => {
                if (!row) return null;
                const rank = ranked.indexOf(row);
                return <PodiumCard key={row.name} row={row} rank={rank} />;
              })}
            </Box>
          )}

          {rest.length > 0 && (
            <Stack spacing={1.5}>
              {rest.map((row) => {
                const rank = ranked.indexOf(row);
                return (
                  <RankRow
                    key={row.name}
                    row={row}
                    rank={rank}
                    highlight={row === me}
                  />
                );
              })}
            </Stack>
          )}
        </Box>
      )}
    </Container>
  );
};

// --- Personal progress hero ------------------------------------------------

function YourProgressCard({ row, rank, above }) {
  const theme = useTheme();
  const { tier, next, pct, xpRemaining } = getTierProgress(row.xp);
  const leadsNeeded = leadsToNextTier(row.xp);
  const chaseXp = above ? Math.round(above.xp - row.xp) : 0;

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 3,
        p: { xs: 2.5, sm: 3 },
        color: theme.palette.primary.contrastText,
        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
        border: `1px solid ${alpha(GOLD, 0.35)}`,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: -60,
          right: -40,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(GOLD, 0.28)} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={{ xs: 2.5, sm: 3 }}
        alignItems={{ xs: 'center', sm: 'center' }}
        sx={{ position: 'relative' }}
      >
        {/* Level ring + rank */}
        <Stack alignItems='center' spacing={0.75} sx={{ flexShrink: 0 }}>
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <Avatar
              sx={{
                width: 84,
                height: 84,
                fontSize: '1.6rem',
                fontWeight: 800,
                bgcolor: alpha('#000', 0.2),
                color: '#fff',
                border: `3px solid ${tier.color}`,
              }}
            >
              {getInitials(row.name)}
            </Avatar>
            <Box
              sx={{
                position: 'absolute',
                bottom: -6,
                right: -6,
                width: 30,
                height: 30,
                borderRadius: '50%',
                bgcolor: tier.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              }}
            >
              {tier.emoji}
            </Box>
          </Box>
          <Chip
            label={`Rank #${rank + 1}`}
            size='small'
            sx={{
              bgcolor: alpha('#fff', 0.15),
              color: '#fff',
              fontWeight: 700,
            }}
          />
        </Stack>

        {/* XP + progress */}
        <Box sx={{ flexGrow: 1, minWidth: 0, width: '100%' }}>
          <Stack
            direction='row'
            alignItems='center'
            justifyContent='space-between'
            flexWrap='wrap'
            useFlexGap
            spacing={1}
          >
            <Typography
              variant='overline'
              sx={{ letterSpacing: 1, color: GOLD, lineHeight: 1.4 }}
            >
              Your Progress · {tier.name}
            </Typography>
            {row.streak > 0 && (
              <Chip
                icon={
                  <LocalFireDepartmentIcon
                    sx={{ color: '#FF7043 !important', fontSize: 18 }}
                  />
                }
                label={`${row.streak}-day streak`}
                size='small'
                sx={{
                  bgcolor: alpha('#FF7043', 0.18),
                  color: '#fff',
                  fontWeight: 700,
                }}
              />
            )}
          </Stack>

          <Stack direction='row' alignItems='baseline' spacing={1} sx={{ mt: 0.5 }}>
            <Typography variant='h4' fontWeight={800}>
              {formatNum(row.xp)}
            </Typography>
            <Typography variant='subtitle2' sx={{ opacity: 0.8 }}>
              XP
            </Typography>
            <Typography variant='body2' sx={{ opacity: 0.7, ml: 1 }}>
              {formatNum(row.leads)} leads · {row.count} sales
            </Typography>
          </Stack>

          {next ? (
            <Box sx={{ mt: 1.5 }}>
              <LinearProgress
                variant='determinate'
                value={pct}
                sx={{
                  height: 10,
                  borderRadius: 5,
                  bgcolor: alpha('#fff', 0.15),
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 5,
                    background: `linear-gradient(90deg, ${GOLD}, ${next.color})`,
                  },
                }}
              />
              <Typography
                variant='caption'
                sx={{ color: GOLD, mt: 0.75, display: 'block' }}
              >
                {leadsNeeded} more leads ({formatNum(xpRemaining)} XP) to reach{' '}
                {next.emoji} {next.name}
              </Typography>
            </Box>
          ) : (
            <Typography variant='caption' sx={{ color: GOLD, mt: 1.5, display: 'block' }}>
              💎 Top tier reached — you're a legend.
            </Typography>
          )}

          {above && chaseXp > 0 && (
            <Typography variant='caption' sx={{ opacity: 0.85, mt: 0.5, display: 'block' }}>
              Pass <b>{above.name}</b>: +{formatNum(chaseXp)} XP (~
              {Math.ceil(chaseXp / LEAD_XP)} leads) to move up.
            </Typography>
          )}

          <BadgeStrip row={row} onDark />
        </Box>

        {/* Weekly lead goal */}
        {row.leadsThisWeek != null && (
          <Stack alignItems='center' spacing={0.5} sx={{ flexShrink: 0 }}>
            <GoalRing value={row.leadsThisWeek} goal={WEEKLY_LEAD_GOAL} onDark />
            <Typography variant='caption' sx={{ opacity: 0.8 }}>
              Leads this week
            </Typography>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

// --- Podium ----------------------------------------------------------------

function PodiumCard({ row, rank }) {
  const theme = useTheme();
  const medal = MEDALS[rank] || MEDALS[2];
  const isFirst = rank === 0;
  const avatarSize = isFirst ? 88 : 68;
  const badges = earnedBadges(row).slice(0, 4);

  return (
    <Paper
      elevation={0}
      sx={{
        flex: 1,
        maxWidth: { sm: isFirst ? 300 : 260 },
        position: 'relative',
        textAlign: 'center',
        px: 2,
        pt: isFirst ? 5 : 4,
        pb: 3,
        mt: { sm: isFirst ? 0 : 3 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: isFirst ? medal.main : 'divider',
        background: isFirst
          ? `linear-gradient(160deg, ${medal.main}1F, ${medal.main}08)`
          : theme.palette.background.paper,
        boxShadow: isFirst
          ? `0 12px 32px ${medal.main}33`
          : '0 4px 16px rgba(0,0,0,0.05)',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: -18,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 36,
          height: 36,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: medal.main,
          color: '#fff',
          boxShadow: `0 4px 10px ${medal.dark}66`,
        }}
      >
        {isFirst ? (
          <EmojiEventsIcon sx={{ fontSize: 22 }} />
        ) : (
          <Typography fontWeight={800} fontSize={16} color='#fff'>
            {rank + 1}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'inline-flex', position: 'relative', mb: 1 }}>
        <Avatar
          sx={{
            width: avatarSize,
            height: avatarSize,
            mx: 'auto',
            fontSize: isFirst ? '1.6rem' : '1.25rem',
            fontWeight: 700,
            bgcolor: stringToColor(row.name),
            border: '3px solid',
            borderColor: medal.main,
          }}
        >
          {getInitials(row.name)}
        </Avatar>
      </Box>

      <Typography
        variant={isFirst ? 'h6' : 'subtitle1'}
        fontWeight={700}
        noWrap
        sx={{ px: 1 }}
      >
        {row.name}
      </Typography>

      <Stack direction='row' justifyContent='center' sx={{ my: 0.5 }}>
        <TierChip tier={row.tier} />
      </Stack>

      <Typography
        variant={isFirst ? 'h5' : 'h6'}
        fontWeight={800}
        sx={{ color: medal.dark }}
      >
        {formatNum(row.xp)} XP
      </Typography>
      <Typography variant='caption' color='text.secondary'>
        {formatNum(row.leads)} leads · {row.count} sales
      </Typography>
      <Typography variant='caption' color='text.secondary' display='block'>
        {formatMoney(row.premiumAmount)} premium
      </Typography>

      {badges.length > 0 && (
        <Stack
          direction='row'
          justifyContent='center'
          spacing={0.5}
          sx={{ mt: 1 }}
        >
          {badges.map((b) => (
            <Tooltip key={b.id} title={`${b.label} — ${b.desc}`}>
              <Box sx={{ fontSize: 18, cursor: 'default' }}>{b.emoji}</Box>
            </Tooltip>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

// --- Ranks 4+ --------------------------------------------------------------

function RankRow({ row, rank, highlight }) {
  const { pct, next } = getTierProgress(row.xp);

  return (
    <Paper
      variant='outlined'
      sx={{
        display: 'flex',
        alignItems: 'center',
        px: { xs: 1.5, sm: 3 },
        py: 1.5,
        borderRadius: 2,
        borderColor: highlight ? row.tier.color : 'divider',
        borderWidth: highlight ? 2 : 1,
        bgcolor: highlight ? alpha(row.tier.color, 0.06) : 'background.paper',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
        },
      }}
    >
      <Stack
        alignItems='center'
        sx={{ width: 34, flexShrink: 0 }}
        spacing={0}
      >
        <Typography sx={{ fontWeight: 700, fontSize: 18, color: 'text.secondary' }}>
          {rank + 1}
        </Typography>
        <RankDelta delta={row.rankDelta} />
      </Stack>

      <Avatar
        sx={{
          width: 40,
          height: 40,
          mx: { xs: 1, sm: 1.5 },
          fontSize: '0.85rem',
          fontWeight: 700,
          bgcolor: stringToColor(row.name),
          border: `2px solid ${row.tier.color}`,
          flexShrink: 0,
        }}
      >
        {getInitials(row.name)}
      </Avatar>

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction='row' alignItems='center' spacing={1}>
          <Typography variant='subtitle1' fontWeight={600} noWrap>
            {row.name}
          </Typography>
          <TierChip tier={row.tier} />
        </Stack>
        <Stack
          direction='row'
          alignItems='center'
          spacing={1}
          sx={{ mt: 0.25 }}
        >
          <Typography variant='caption' color='text.secondary'>
            🎯 {formatNum(row.leads)} leads · {row.count} sales
          </Typography>
        </Stack>
        {next && (
          <LinearProgress
            variant='determinate'
            value={pct}
            sx={{
              mt: 0.75,
              height: 5,
              borderRadius: 5,
              maxWidth: 260,
              bgcolor: 'action.hover',
              '& .MuiLinearProgress-bar': {
                borderRadius: 5,
                bgcolor: row.tier.color,
              },
            }}
          />
        )}
      </Box>

      <Stack alignItems='flex-end' sx={{ flexShrink: 0, pl: 1 }}>
        <Typography variant='subtitle1' fontWeight={800}>
          {formatNum(row.xp)} XP
        </Typography>
        <Typography variant='caption' color='text.secondary' noWrap>
          {formatMoney(row.premiumAmount)}
        </Typography>
      </Stack>
    </Paper>
  );
}

// --- Small shared pieces ---------------------------------------------------

function TierChip({ tier }) {
  if (!tier) return null;
  return (
    <Chip
      label={`${tier.emoji} ${tier.name}`}
      size='small'
      sx={{
        height: 20,
        fontSize: '0.68rem',
        fontWeight: 700,
        bgcolor: alpha(tier.color, 0.15),
        color: tier.color,
        border: `1px solid ${alpha(tier.color, 0.4)}`,
        '& .MuiChip-label': { px: 0.75 },
      }}
    />
  );
}

function RankDelta({ delta }) {
  if (delta == null) return null;
  if (delta === 0) {
    return (
      <RemoveIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
    );
  }
  const up = delta > 0;
  return (
    <Stack
      direction='row'
      alignItems='center'
      sx={{ color: up ? 'success.main' : 'error.main', lineHeight: 1 }}
    >
      {up ? (
        <ArrowDropUpIcon sx={{ fontSize: 16 }} />
      ) : (
        <ArrowDropDownIcon sx={{ fontSize: 16 }} />
      )}
      <Typography variant='caption' fontWeight={700} sx={{ fontSize: '0.65rem' }}>
        {Math.abs(delta)}
      </Typography>
    </Stack>
  );
}

function BadgeStrip({ row, onDark }) {
  const badges = earnedBadges(row);
  if (!badges.length) return null;
  return (
    <Stack
      direction='row'
      spacing={0.75}
      flexWrap='wrap'
      useFlexGap
      sx={{ mt: 1.5 }}
    >
      {badges.map((b) => (
        <Tooltip key={b.id} title={b.desc}>
          <Chip
            label={`${b.emoji} ${b.label}`}
            size='small'
            sx={{
              fontWeight: 600,
              fontSize: '0.68rem',
              bgcolor: onDark ? alpha('#fff', 0.14) : 'action.hover',
              color: onDark ? '#fff' : 'text.primary',
            }}
          />
        </Tooltip>
      ))}
    </Stack>
  );
}

function GoalRing({ value, goal, onDark }) {
  const pct = Math.min(100, Math.round(((Number(value) || 0) / goal) * 100));
  const size = 76;
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <CircularProgress
        variant='determinate'
        value={100}
        size={size}
        thickness={4}
        sx={{
          color: onDark ? alpha('#fff', 0.15) : 'action.hover',
          position: 'absolute',
          left: 0,
        }}
      />
      <CircularProgress
        variant='determinate'
        value={pct}
        size={size}
        thickness={4}
        sx={{ color: GOLD, '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        <Typography variant='subtitle1' fontWeight={800} sx={{ color: onDark ? '#fff' : 'text.primary' }}>
          {value}
        </Typography>
        <Typography variant='caption' sx={{ opacity: 0.7, fontSize: '0.65rem' }}>
          / {goal}
        </Typography>
      </Box>
    </Box>
  );
}

function PeriodWinnerCard({ eyebrow, period, loading }) {
  const theme = useTheme();
  const gold = theme.palette.action?.main || GOLD;
  const winner = period?.winner;

  return (
    <Paper
      elevation={0}
      sx={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 3,
        p: 2.5,
        color: theme.palette.primary.contrastText,
        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
        border: `1px solid ${gold}55`,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 140,
          height: 140,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${gold}44 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      <Stack
        direction='row'
        alignItems='center'
        spacing={1}
        sx={{ mb: 1.5, position: 'relative' }}
      >
        <WorkspacePremiumIcon sx={{ color: gold, fontSize: 20 }} />
        <Typography
          variant='overline'
          sx={{ letterSpacing: 1, lineHeight: 1.4, color: gold }}
        >
          {eyebrow}
        </Typography>
      </Stack>

      {loading ? (
        <Stack direction='row' alignItems='center' spacing={1.5} sx={{ position: 'relative' }}>
          <Skeleton variant='circular' width={48} height={48} />
          <Box sx={{ flexGrow: 1 }}>
            <Skeleton variant='text' width='60%' height={28} />
            <Skeleton variant='text' width='40%' />
          </Box>
        </Stack>
      ) : winner ? (
        <Stack direction='row' alignItems='center' spacing={1.5} sx={{ position: 'relative' }}>
          <Avatar
            sx={{
              width: 48,
              height: 48,
              fontWeight: 700,
              bgcolor: gold,
              color: theme.palette.primary.main,
              border: `2px solid ${gold}`,
            }}
          >
            {getInitials(winner.name)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant='h6' fontWeight={700} noWrap>
              {winner.name}
            </Typography>
            <Typography variant='body2' sx={{ opacity: 0.85 }} noWrap>
              {winner.leads != null ? `${formatNum(winner.leads)} leads · ` : ''}
              {formatMoney(winner.premiumAmount)}
            </Typography>
          </Box>
        </Stack>
      ) : (
        <Typography variant='body2' sx={{ opacity: 0.7, position: 'relative' }}>
          No sales recorded.
        </Typography>
      )}

      {period?.periodLabel && (
        <Typography
          variant='caption'
          sx={{ opacity: 0.6, mt: 1.5, display: 'block', position: 'relative' }}
        >
          {period.periodLabel}
        </Typography>
      )}
    </Paper>
  );
}

export default Leaderboard;
