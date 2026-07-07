import {
  Box,
  Typography,
  Stack,
  Container,
  Avatar,
  Skeleton,
  Paper,
  useTheme,
} from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import { useQuery } from '@tanstack/react-query';
import {
  getPremiumLeaderboard,
  getLeaderboardPeriodWinners,
} from '../utils/query';
import { useAgent } from '../hooks/useAgent';
import DateSelector from '../components/DateSelector';
import { stringToColor } from '../utils/helpers';
import dayjs from 'dayjs';
import { useState } from 'react';

const TOP_LIST_LIMIT = 10;

// Gold / silver / bronze medal palette, tuned to the app's warm brand tones.
const MEDALS = {
  0: { main: '#D4AF37', dark: '#A8841E', label: 'Gold' },
  1: { main: '#B4BAC2', dark: '#8A9099', label: 'Silver' },
  2: { main: '#CD7F32', dark: '#9C5E22', label: 'Bronze' },
};

const getInitials = (name) =>
  (name || '')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const formatMoney = (value) => `$${Math.round(Number(value) || 0).toLocaleString()}`;

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

  // Period winners are fixed calendar periods, independent of the date
  // selector — so they get their own stable query key and don't refetch when
  // the range above changes.
  const { data: periodWinners } = useQuery({
    queryKey: ['leaderboardPeriodWinners', agent?.org_id],
    queryFn: () => getLeaderboardPeriodWinners({ agency: agent?.org_id }),
    enabled: !!agent?.org_id,
  });

  const handleStartChange = (val) =>
    setStartDate(val && dayjs(val).isValid() ? dayjs(val).format('YYYY-MM-DD') : '');
  const handleEndChange = (val) =>
    setEndDate(val && dayjs(val).isValid() ? dayjs(val).format('YYYY-MM-DD') : '');

  const topRows = rows.slice(0, TOP_LIST_LIMIT);
  const podium = topRows.slice(0, 3);
  const rest = topRows.slice(3);

  return (
    <Container sx={{ mt: 4, mb: 8 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent='space-between'
        alignItems={{ sm: 'center' }}
        spacing={2}
        mb={3}
      >
        <Typography variant='h4'>Leaderboard</Typography>
        <DateSelector
          startDate={startDate}
          endDate={endDate}
          handleStartChange={handleStartChange}
          handleEndChange={handleEndChange}
          refetchFunction={refetch}
          isLoading={isLoading}
        />
      </Stack>

      {/* Period winner callouts */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ maxWidth: 900, mx: 'auto', mb: { xs: 4, sm: 6 } }}
      >
        <PeriodWinnerCard
          eyebrow="Last Month's Champion"
          period={periodWinners?.lastMonth}
        />
        <PeriodWinnerCard
          eyebrow="Last Week's Champion"
          period={periodWinners?.lastWeek}
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
          <Typography>No sales recorded for this period yet.</Typography>
        </Box>
      ) : (
        <Box sx={{ maxWidth: 900, mx: 'auto' }}>
          {/* Podium — top 3 */}
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
              {/* Render order 2 · 1 · 3 on desktop so #1 sits centered. */}
              {[podium[1], podium[0], podium[2]].map((row) => {
                if (!row) return null;
                const rank = rows.indexOf(row);
                return <PodiumCard key={row.name} row={row} rank={rank} />;
              })}
            </Box>
          )}

          {/* Ranks 4–10 */}
          {rest.length > 0 && (
            <Stack spacing={1.5}>
              {rest.map((row) => {
                const rank = rows.indexOf(row);
                return (
                  <Paper
                    key={row.name}
                    variant='outlined'
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      px: { xs: 2, sm: 3 },
                      py: 1.5,
                      borderRadius: 2,
                      borderColor: 'divider',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      '&:hover': {
                        transform: 'translateY(-1px)',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                      },
                    }}
                  >
                    <Typography
                      sx={{
                        width: 32,
                        fontWeight: 700,
                        fontSize: 18,
                        color: 'text.secondary',
                        flexShrink: 0,
                      }}
                    >
                      {rank + 1}
                    </Typography>
                    <Avatar
                      sx={{
                        width: 40,
                        height: 40,
                        mx: 1.5,
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        bgcolor: stringToColor(row.name),
                      }}
                    >
                      {getInitials(row.name)}
                    </Avatar>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography
                        variant='subtitle1'
                        fontWeight={600}
                        noWrap
                      >
                        {row.name}
                      </Typography>
                      <Typography variant='caption' color='text.secondary'>
                        {row.count} {row.count === 1 ? 'Sale' : 'Sales'}
                      </Typography>
                    </Box>
                    <Stack alignItems='flex-end' sx={{ flexShrink: 0, pl: 1 }}>
                      <Typography variant='subtitle1' fontWeight={700}>
                        {formatMoney(row.premiumAmount)}
                      </Typography>
                      <Typography variant='caption' color='text.secondary'>
                        Total Premium
                      </Typography>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Box>
      )}
    </Container>
  );
};

function PodiumCard({ row, rank }) {
  const theme = useTheme();
  const medal = MEDALS[rank];
  const isFirst = rank === 0;
  const avatarSize = isFirst ? 88 : 68;

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
      {/* Crown / medal marker */}
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

      <Box sx={{ display: 'inline-flex', position: 'relative', mb: 1.5 }}>
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

      <Typography
        variant={isFirst ? 'h5' : 'h6'}
        fontWeight={800}
        sx={{ color: medal.dark, mt: 0.5 }}
      >
        {formatMoney(row.premiumAmount)}
      </Typography>
      <Typography variant='caption' color='text.secondary'>
        {row.count} {row.count === 1 ? 'Sale' : 'Sales'} · Total Premium
      </Typography>
    </Paper>
  );
}

function PeriodWinnerCard({ eyebrow, period }) {
  const theme = useTheme();
  const gold = theme.palette.action?.main || '#D4AF37';
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
      {/* Gold glow accent */}
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

      {winner ? (
        <Stack
          direction='row'
          alignItems='center'
          spacing={1.5}
          sx={{ position: 'relative' }}
        >
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
              {formatMoney(winner.premiumAmount)} · {winner.count}{' '}
              {winner.count === 1 ? 'sale' : 'sales'}
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
